import crypto from "crypto";

export function signPremiumToken(secret) {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  const payload = Buffer.from(JSON.stringify({ premium: true, exp })).toString(
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
