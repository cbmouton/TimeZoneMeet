/**
 * Verify stored premium token with server, then refresh ad / premium UI.
 */
(function () {
  async function syncPremium() {
    const base = window.TZM.getApiBase();
    const token = window.TZM.getPremiumToken();

    if (!token) {
      try {
        sessionStorage.removeItem("tz_premium_active");
      } catch {
        /* ignore */
      }
      if (typeof window.__applyPremiumUI === "function") {
        window.__applyPremiumUI();
      }
      return;
    }

    try {
      const url =
        base +
        "/api/premium-status?token=" +
        encodeURIComponent(token);
      const res = await fetch(url);
      const data = await res.json();
      if (data.premium) {
        try {
          sessionStorage.setItem("tz_premium_active", "1");
        } catch {
          /* ignore */
        }
      } else {
        window.TZM.clearPremiumToken();
        try {
          sessionStorage.removeItem("tz_premium_active");
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* offline: keep local session if we had one */
    }

    if (typeof window.__applyPremiumUI === "function") {
      window.__applyPremiumUI();
    }
  }

  window.__syncPremium = syncPremium;
  syncPremium();
})();
