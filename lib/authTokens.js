import crypto from "crypto";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256Base64Url(value) {
  return crypto.createHash("sha256").update(String(value)).digest("base64url");
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  // Intentionally simple; we only need to avoid obvious junk.
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

