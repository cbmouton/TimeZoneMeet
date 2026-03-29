import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import tzLookup from "tz-lookup";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import { signPremiumToken, verifyPremiumToken } from "./lib/premiumToken.js";
import { openAuthDb } from "./lib/authDb.js";
import { isValidEmail, normalizeEmail, randomToken, sha256Base64Url } from "./lib/authTokens.js";
import { findScheduleSlots } from "./lib/scheduleSlots.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "db", "cities.db");
const db = new Database(dbPath, { readonly: true });
const authDb = openAuthDb();

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
const PORT = process.env.PORT || 8080;

const stripeSecret = (process.env.STRIPE_SECRET_KEY || "").trim();
const stripePriceId = (process.env.STRIPE_PRICE_ID || "").trim();

const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const AUTH_FROM_EMAIL = (process.env.AUTH_FROM_EMAIL || "").trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
const CORS_ALLOWLIST = (process.env.CORS_ALLOWLIST || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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

function getDefaultAllowedOrigins() {
  const defaults = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ]);
  if (PUBLIC_BASE_URL) defaults.add(PUBLIC_BASE_URL);
  for (const o of CORS_ALLOWLIST) defaults.add(o);
  return defaults;
}

const allowedOrigins = getDefaultAllowedOrigins();
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
};

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors(corsOptions));

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

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const authStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.email || "");
    const ip = getClientIp(req);
    return email ? `${ip}:${email}` : ip;
  },
  message: { error: "Too many sign-in attempts. Please wait and try again." },
});

const authConsumeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  message: { error: "Too many sign-in verifications. Please try again later." },
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checkout attempts. Please try again later." },
});

app.use("/api", apiLimiter);

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function logSecurityEvent(req, event, detail = {}) {
  const payload = {
    event,
    ip: getClientIp(req),
    ua: String(req.get("user-agent") || "").slice(0, 180),
    path: req.path,
    ts: new Date().toISOString(),
    ...detail,
  };
  console.info("[security]", JSON.stringify(payload));
}

function requireHumanLikeRequest(req, res, next) {
  const ua = String(req.get("user-agent") || "").toLowerCase();
  if (!ua || ua.length < 8) {
    logSecurityEvent(req, "auth_blocked_missing_ua");
    return res.status(400).json({ error: "Bad request" });
  }
  if (/(bot|crawler|spider|curl|wget|python-requests)/i.test(ua)) {
    logSecurityEvent(req, "auth_blocked_bot_ua");
    return res.status(400).json({ error: "Bad request" });
  }
  return next();
}

async function sendMagicLinkEmail({ to, link }) {
  if (!RESEND_API_KEY || !AUTH_FROM_EMAIL) {
    throw new Error("Resend is not configured (set RESEND_API_KEY and AUTH_FROM_EMAIL)");
  }
  if (!PUBLIC_BASE_URL) {
    throw new Error("PUBLIC_BASE_URL is required for magic links");
  }

  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.5;">
      <h2 style="margin: 0 0 12px;">Sign in to TimeZoneMeet</h2>
      <p style="margin: 0 0 12px;">Click this link to sign in. It expires in 20 minutes.</p>
      <p style="margin: 0 0 16px;"><a href="${link}">${link}</a></p>
      <p style="margin: 0; color: #666; font-size: 12px;">If you didn’t request this, you can ignore this email.</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: AUTH_FROM_EMAIL,
      to,
      subject: "Your TimeZoneMeet sign-in link",
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend send failed: ${res.status} ${text}`.trim());
  }
}

function getOrCreateUserByEmail(email) {
  const now = Date.now();
  const existing = authDb.prepare("SELECT id, email, premium FROM users WHERE email = ?").get(email);
  if (existing) return existing;
  const info = authDb
    .prepare("INSERT INTO users (email, premium, created_at) VALUES (?, 0, ?)")
    .run(email, now);
  return { id: Number(info.lastInsertRowid), email, premium: 0 };
}

function setUserPremiumByEmail(email, premium) {
  authDb.prepare("UPDATE users SET premium = ? WHERE email = ?").run(premium ? 1 : 0, email);
}

function upsertDevice(userId, deviceIdHash) {
  const now = Date.now();
  const row = authDb
    .prepare(
      "SELECT id, revoked_at FROM devices WHERE user_id = ? AND device_id_hash = ?"
    )
    .get(userId, deviceIdHash);
  if (row) {
    authDb
      .prepare("UPDATE devices SET last_seen_at = ?, revoked_at = NULL WHERE id = ?")
      .run(now, row.id);
    return;
  }
  authDb
    .prepare(
      "INSERT INTO devices (user_id, device_id_hash, created_at, last_seen_at, revoked_at) VALUES (?, ?, ?, ?, NULL)"
    )
    .run(userId, deviceIdHash, now, now);
}

function countActiveDevices(userId) {
  const row = authDb
    .prepare("SELECT COUNT(1) AS c FROM devices WHERE user_id = ? AND revoked_at IS NULL")
    .get(userId);
  return Number(row?.c || 0);
}

function enforceMaxDevicesOrThrow(userId, deviceIdHash, maxDevices = 2) {
  const existing = authDb
    .prepare(
      "SELECT id FROM devices WHERE user_id = ? AND device_id_hash = ? AND revoked_at IS NULL"
    )
    .get(userId, deviceIdHash);
  if (existing) return;
  const active = countActiveDevices(userId);
  if (active >= maxDevices) {
    const err = new Error("Device limit reached");
    err.code = "DEVICE_LIMIT";
    err.status = 403;
    throw err;
  }
}

app.post("/api/auth/start", authStartLimiter, requireHumanLikeRequest, async (req, res) => {
  const emailRaw = req.body?.email;
  const email = normalizeEmail(emailRaw);
  const honeypot = String(req.body?.website || "").trim();
  if (honeypot) {
    logSecurityEvent(req, "auth_honeypot_triggered");
    // Return success-shaped response to avoid teaching bots.
    return res.json({ ok: true });
  }
  if (!isValidEmail(email)) {
    logSecurityEvent(req, "auth_start_invalid_email");
    return res.status(400).json({ error: "Valid email is required" });
  }
  if (!PUBLIC_BASE_URL) {
    logSecurityEvent(req, "auth_start_not_configured");
    return res.status(503).json({ error: "Auth is not configured", hint: "Set PUBLIC_BASE_URL" });
  }

  const user = getOrCreateUserByEmail(email);
  const token = randomToken(32);
  const tokenHash = sha256Base64Url(token);
  const now = Date.now();
  const expiresAt = now + 20 * 60 * 1000;
  const ip = getClientIp(req);
  authDb
    .prepare(
      "INSERT INTO magic_links (user_id, token_hash, expires_at, used_at, created_at, created_ip) VALUES (?, ?, ?, NULL, ?, ?)"
    )
    .run(user.id, tokenHash, expiresAt, now, ip);

  const link = `${PUBLIC_BASE_URL}/auth.html?token=${encodeURIComponent(token)}`;

  try {
    await sendMagicLinkEmail({ to: email, link });
    logSecurityEvent(req, "auth_start_sent");
    return res.json({ ok: true });
  } catch (e) {
    console.error("Magic link send:", e.message);
    logSecurityEvent(req, "auth_start_send_failed");
    // Keep response generic to reduce account/email enumeration.
    return res.json({ ok: true });
  }
});

app.post("/api/auth/consume", authConsumeLimiter, requireHumanLikeRequest, (req, res) => {
  const token = String(req.body?.token || "").trim();
  const deviceId = String(req.body?.deviceId || "").trim();
  if (!token || token.length < 20) {
    logSecurityEvent(req, "auth_consume_invalid_token_shape");
    return res.status(400).json({ error: "Invalid token" });
  }
  if (!deviceId || deviceId.length < 10) {
    logSecurityEvent(req, "auth_consume_invalid_device_shape");
    return res.status(400).json({ error: "Invalid device" });
  }

  const tokenHash = sha256Base64Url(token);
  const link = authDb
    .prepare(
      `SELECT ml.id, ml.user_id, ml.expires_at, ml.used_at, u.email, u.premium
       FROM magic_links ml
       JOIN users u ON u.id = ml.user_id
       WHERE ml.token_hash = ?
       LIMIT 1`
    )
    .get(tokenHash);

  if (!link) {
    logSecurityEvent(req, "auth_consume_link_not_found");
    return res.status(400).json({ error: "Invalid or expired link" });
  }
  if (link.used_at) {
    logSecurityEvent(req, "auth_consume_link_already_used");
    return res.status(400).json({ error: "This link was already used" });
  }
  if (Number(link.expires_at) < Date.now()) {
    logSecurityEvent(req, "auth_consume_link_expired");
    return res.status(400).json({ error: "This link expired" });
  }

  const deviceIdHash = sha256Base64Url(deviceId);
  try {
    enforceMaxDevicesOrThrow(link.user_id, deviceIdHash, 2);
  } catch (e) {
    logSecurityEvent(req, "auth_consume_device_limit", { userId: link.user_id });
    return res.status(e.status || 403).json({ error: e.message, code: e.code || "DENIED" });
  }

  const now = Date.now();
  const tx = authDb.transaction(() => {
    authDb.prepare("UPDATE magic_links SET used_at = ? WHERE id = ?").run(now, link.id);
    upsertDevice(link.user_id, deviceIdHash);
  });
  tx();

  const premiumToken = link.premium ? signPremiumToken(PREMIUM_SECRET) : "";
  logSecurityEvent(req, "auth_consume_success", {
    userId: link.user_id,
    premium: Boolean(link.premium),
  });
  return res.json({
    ok: true,
    email: link.email,
    premium: Boolean(link.premium),
    premiumToken,
  });
});

function sanitizeCity(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function sanitizeCountry(value) {
  if (typeof value !== "string") return undefined;
  const c = value.trim().toUpperCase();
  return c.length ? c : undefined;
}

/**
 * HH:mm in 24h form for `date` in `timeZone`.
 * Intl may return "24:00" at local midnight; users expect "00:00".
 */
function formatLocalTimeHHMM(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let h = 0;
  let m = 0;
  for (const p of dtf.formatToParts(date)) {
    if (p.type === "hour") h = Number(p.value);
    if (p.type === "minute") m = Number(p.value);
  }
  if (h === 24) h = 0;
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return new Date().toLocaleTimeString("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).replace(/^24:/, "00:");
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
app.post("/api/create-checkout-session", checkoutLimiter, postStripeCheckoutSession);
app.post("/api/stripe-session", checkoutLimiter, postStripeCheckoutSession);

app.post("/api/verify-session", checkoutLimiter, async (req, res) => {
  const sessionId = req.body?.sessionId;
  if (!stripe || !sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ error: "Invalid request" });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const email = normalizeEmail(
      session.customer_details?.email || session.customer_email || ""
    );
    if (email && isValidEmail(email)) {
      try {
        getOrCreateUserByEmail(email);
        setUserPremiumByEmail(email, true);
      } catch (e) {
        console.error("Premium email bind failed:", e.message);
      }
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
    const time = formatLocalTimeHHMM(new Date(), timezone);

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
    const time = formatLocalTimeHHMM(new Date(), timezone);

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

app.post("/api/schedule", (req, res) => {
  const cityA = sanitizeCity(req.body?.cityA);
  const countryA = sanitizeCountry(req.body?.countryA);
  const cityB = sanitizeCity(req.body?.cityB);
  const countryB = sanitizeCountry(req.body?.countryB);
  let durationMinutes = Number(req.body?.durationMinutes);

  if (!cityA || !cityB) {
    return res.status(400).json({ error: "cityA and cityB are required" });
  }
  if (!Number.isFinite(durationMinutes)) durationMinutes = 60;
  durationMinutes = Math.round(durationMinutes);
  if (durationMinutes < 15 || durationMinutes > 480) {
    return res.status(400).json({ error: "durationMinutes must be between 15 and 480" });
  }

  try {
    const rowA = lookupCityRow(cityA, countryA);
    const rowB = lookupCityRow(cityB, countryB);
    if (!rowA || !rowB) {
      return res.status(404).json({ error: "City not found" });
    }

    const tzA = tzLookup(rowA.lat, rowA.lon);
    const tzB = tzLookup(rowB.lat, rowB.lon);

    const result = findScheduleSlots({
      tzA,
      tzB,
      cityA: rowA.name,
      countryA: rowA.country,
      cityB: rowB.name,
      countryB: rowB.country,
      durationMinutes,
    });

    return res.json({
      ok: true,
      locations: [
        { city: rowA.name, country: rowA.country, timezone: tzA },
        { city: rowB.name, country: rowB.country, timezone: tzB },
      ],
      durationMinutes: result.durationMinutes,
      horizonDays: result.horizonDays,
      perfect: result.perfect,
      compromise: result.compromise,
    });
  } catch (err) {
    console.error("Schedule failed:", err.message);
    return res.status(500).json({ error: "Schedule failed" });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
