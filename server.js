import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import tzLookup from "tz-lookup";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import { signPremiumToken, verifyPremiumToken } from "./lib/premiumToken.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "db", "cities.db");
const db = new Database(dbPath, { readonly: true });

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 8080;

const stripeSecret = (process.env.STRIPE_SECRET_KEY || "").trim();
const stripePriceId = (process.env.STRIPE_PRICE_ID || "").trim();

/** Stripe Checkout line_items[].price must be a Price object id (price_…), not an amount. */
function isStripePriceId(value) {
  return typeof value === "string" && /^price_[a-zA-Z0-9]+$/.test(value);
}

let stripe = null;
if (stripeSecret) {
  try {
    stripe = new Stripe(stripeSecret);
  } catch (e) {
    console.error("Stripe init failed (check STRIPE_SECRET_KEY):", e.message);
  }
}

const PREMIUM_SECRET =
  (process.env.PREMIUM_JWT_SECRET || "").trim() ||
  stripeSecret ||
  "dev-only-change-in-production";

function premiumFromAuth(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return false;
  return verifyPremiumToken(h.slice(7).trim(), PREMIUM_SECRET);
}

app.use(cors({ origin: true, credentials: true }));

app.post(
  "/api/stripe-webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const whSecret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    if (!stripe || !whSecret) {
      return res.status(503).send("Webhook not configured");
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature"), whSecret);
    } catch (err) {
      console.error("Stripe webhook signature:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    if (event.type === "checkout.session.completed") {
      console.log("Stripe checkout.session.completed", event.data.object.id);
    }
    res.json({ received: true });
  }
);

app.use(express.json());

function sanitizeCity(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function sanitizeCountry(value) {
  if (typeof value !== "string") return undefined;
  const c = value.trim().toUpperCase();
  return c.length ? c : undefined;
}

function lookupCityRow(city, country) {
  if (country) {
    const stmt = db.prepare(`
      SELECT name, country, lat, lon
      FROM cities
      WHERE LOWER(name) = LOWER(?)
        AND country = ?
      LIMIT 1
    `);
    return stmt.get(city, country);
  }

  const stmt = db.prepare(`
    SELECT name, country, lat, lon
    FROM cities
    WHERE LOWER(name) = LOWER(?)
    UNION ALL
    SELECT name, country, lat, lon
    FROM cities
    WHERE LOWER(name) LIKE LOWER(?) || '%'
    LIMIT 1
  `);

  return stmt.get(city, city);
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    checkout: {
      stripeKeySet: Boolean(stripeSecret),
      stripeClientOk: Boolean(stripe),
      priceIdSet: Boolean(stripePriceId),
      priceIdFormatOk: isStripePriceId(stripePriceId),
      ready: Boolean(stripe && isStripePriceId(stripePriceId)),
    },
  });
});

app.get("/api/premium-status", (req, res) => {
  const token =
    (typeof req.query.token === "string" && req.query.token) ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : "");
  const ok = token && verifyPremiumToken(token, PREMIUM_SECRET);
  res.json({ premium: Boolean(ok) });
});

async function postStripeCheckoutSession(req, res) {
  if (!stripe || !stripePriceId) {
    return res.status(503).json({
      error: "Premium checkout is not configured",
      hint: "Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID on Railway (no quotes or spaces). See GET /health for checkout.* flags.",
    });
  }
  if (!isStripePriceId(stripePriceId)) {
    return res.status(503).json({
      error: "STRIPE_PRICE_ID must be a Stripe Price ID, not a dollar amount",
      detail:
        "In Stripe Dashboard: Products → your product → copy the Price ID (starts with price_). See https://docs.stripe.com/products-prices/manage-prices",
    });
  }
  const base = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "") ||
    `${req.protocol}://${req.get("host")}`;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${base.replace(/\/$/, "")}/premium.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base.replace(/\/$/, "")}/`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout:", err.message);
    const detail =
      err && typeof err.message === "string" ? err.message : "unknown error";
    res.status(500).json({ error: "Checkout failed", detail });
  }
}

// Primary path for clients. Some hosts (e.g. Railway + edge) return a non-JSON 503 for
// POST /api/create-checkout-session — that string matches common WAF/tutorial patterns.
app.post("/api/stripe-session", postStripeCheckoutSession);
app.post("/api/create-checkout-session", postStripeCheckoutSession);

app.post("/api/verify-session", async (req, res) => {
  const sessionId = req.body?.sessionId;
  if (!stripe || !sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "Invalid request" });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }
    const token = signPremiumToken(PREMIUM_SECRET);
    res.json({ token });
  } catch (err) {
    console.error("Verify session:", err.message);
    res.status(400).json({ error: "Could not verify session" });
  }
});

app.get("/api/suggest", (req, res) => {
  const q = sanitizeCity(req.query.q);
  const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "10";
  const maxCap = premiumFromAuth(req) ? 50 : 25;
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 10, 1), maxCap);

  if (!q) return res.json({ suggestions: [] });

  try {
    const stmt = db.prepare(`
      SELECT name, country
      FROM cities
      WHERE LOWER(name) LIKE LOWER(?) || '%'
      ORDER BY name ASC, country ASC
      LIMIT ?
    `);

    const suggestions = stmt.all(q, limit);
    return res.json({ suggestions });
  } catch (err) {
    console.error("Suggest failed:", err.message);
    return res.status(500).json({ error: "Suggest failed" });
  }
});

app.get("/api/timezone", (req, res) => {
  const city = sanitizeCity(req.query.city);
  const country = sanitizeCountry(req.query.country);

  if (!city) {
    return res.status(400).json({ error: "City is required" });
  }

  try {
    const row = lookupCityRow(city, country);

    if (!row) {
      return res.status(404).json({ error: "City not found" });
    }

    const timezone = tzLookup(row.lat, row.lon);
    const time = new Date().toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return res.json({
      city: row.name,
      country: row.country,
      timezone,
      time,
    });
  } catch (err) {
    console.error("Timezone lookup failed:", err.message);
    return res.status(500).json({ error: "Timezone lookup failed" });
  }
});

app.post("/api/timezone", (req, res) => {
  const city = sanitizeCity(req.body?.city);
  const country = sanitizeCountry(req.body?.country);

  if (!city) {
    return res.status(400).json({ error: "City is required" });
  }

  try {
    const row = lookupCityRow(city, country);

    if (!row) {
      return res.status(404).json({ error: "City not found" });
    }

    const timezone = tzLookup(row.lat, row.lon);
    const time = new Date().toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    return res.json({
      city: row.name,
      country: row.country,
      timezone,
      time,
    });
  } catch (err) {
    console.error("Timezone lookup failed:", err.message);
    return res.status(500).json({ error: "Timezone lookup failed" });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
