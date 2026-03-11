import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import tzLookup from "tz-lookup";
import path from "path";
import { fileURLToPath } from "url";

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database
const dbPath = path.join(__dirname, "db", "cities.db");
const db = new Database(dbPath, { readonly: true });

// App
const app = express();
const PORT = process.env.PORT || 8080;

// CORS: required for native apps (iOS/Android/macOS/Windows) and future web on different domain
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Helpers
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
  // Exact match first; if not found, prefix match
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

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Autocomplete suggestions
// GET /api/suggest?q=San&limit=10
app.get("/api/suggest", (req, res) => {
  const q = sanitizeCity(req.query.q);
  const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "10";
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 10, 1), 25);

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
    console.error("❌ Suggest failed:", err.message);
    return res.status(500).json({ error: "Suggest failed" });
  }
});

// GET timezone lookup for easy testing:
// /api/timezone?city=Paris&country=FR
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
    console.error("❌ Timezone lookup failed:", err.message);
    return res.status(500).json({ error: "Timezone lookup failed" });
  }
});

// POST timezone lookup (what the UI uses)
// Body: { "city": "Paris", "country": "FR" }
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
    console.error("❌ Timezone lookup failed:", err.message);
    return res.status(500).json({ error: "Timezone lookup failed" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
