import crypto from "crypto";

const DEFAULT_PREMIUM_TTL_SECONDS = 90 * 24 * 3600;

export function signPremiumToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  const envTtl = Number.parseInt(process.env.PREMIUM_TOKEN_TTL_SECONDS || "", 10);
  const ttl = Number.isFinite(envTtl) && envTtl > 0 ? envTtl : DEFAULT_PREMIUM_TTL_SECONDS;
  const exp = now + ttl;
  const payload = Buffer.from(JSON.stringify({ premium: true, iat: now, exp })).toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyPremiumToken(token, secret) {
  if (!token || typeof token !== "string") return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return false;
    }
  } catch {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.premium || typeof data.exp !== "number") return false;
    if (data.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}
