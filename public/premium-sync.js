/**
 * Verify stored premium token with server, then refresh ad / premium UI.
 */
(function () {
  function isNativeIOS() {
    const c = window.Capacitor;
    return Boolean(c && typeof c.getPlatform === "function" && c.getPlatform() === "ios");
  }

  async function syncIOSPremiumFromIAP() {
    if (!isNativeIOS()) return false;
    if (!window.__IAP_ENABLED__) return false;
    const store = window.store;
    const pid = window.__IAP_PRODUCT_ID__;
    if (!store || !pid) return false;

    return new Promise((resolve) => {
      try {
        store.when().productUpdated((p) => {
          if (p && p.id === pid) {
            resolve(Boolean(p.owned));
          }
        });
        store.when().approved((p) => {
          if (p && p.id === pid) {
            try {
              p.finish();
            } catch {
              /* ignore */
            }
            resolve(true);
          }
        });
        store.refresh();
        const p = store.get(pid);
        if (p && p.owned) resolve(true);
        // otherwise resolve from callbacks above
      } catch {
        resolve(false);
      }
    });
  }

  async function syncPremium() {
    // iOS premium is handled by Apple IAP (local ownership). Don't call Stripe server for iOS.
    if (isNativeIOS()) {
      const owned = await syncIOSPremiumFromIAP();
      try {
        if (owned) sessionStorage.setItem("tz_premium_active", "1");
        else sessionStorage.removeItem("tz_premium_active");
      } catch {
        /* ignore */
      }
      if (typeof window.__applyPremiumUI === "function") window.__applyPremiumUI();
      return;
    }

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
