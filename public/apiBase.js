/**
 * Shared API base and auth helpers (used by app.js, premium-sync.js, ads flow).
 */
(function () {
  const TOKEN_KEY = "tz_premium_token";
  const DEVICE_KEY = "tz_device_id";

  function getApiBase() {
    let b =
      typeof window.__API_BASE__ === "string"
        ? window.__API_BASE__.trim().replace(/\/$/, "")
        : "";
    if (b && !/^https?:\/\//i.test(b)) {
      b = "https://" + b;
    }
    return b;
  }

  function getOrCreateDeviceId() {
    try {
      const existing = localStorage.getItem(DEVICE_KEY);
      if (existing && typeof existing === "string" && existing.length >= 16) return existing;
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const id = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch {
      return "";
    }
  }

  function getPremiumToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function authHeaders() {
    const t = getPremiumToken();
    const h = {};
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }

  function clearPremiumToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  window.TZM = {
    getApiBase,
    getOrCreateDeviceId,
    getPremiumToken,
    authHeaders,
    clearPremiumToken,
    TOKEN_KEY,
  };
})();
