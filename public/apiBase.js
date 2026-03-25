/**
 * Shared API base and auth helpers (used by app.js, premium-sync.js, ads flow).
 */
(function () {
  const TOKEN_KEY = "tz_premium_token";

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
    getPremiumToken,
    authHeaders,
    clearPremiumToken,
    TOKEN_KEY,
  };
})();
