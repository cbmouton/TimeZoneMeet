/**
 * iOS In‑App Purchase wiring (cordova-plugin-purchase).
 * Web continues to use Stripe; iOS uses StoreKit ownership locally.
 */
(function () {
  function isNativeIOS() {
    const c = window.Capacitor;
    return Boolean(c && typeof c.getPlatform === "function" && c.getPlatform() === "ios");
  }

  function enabled() {
    return isNativeIOS() && Boolean(window.__IAP_ENABLED__) && typeof window.store === "object";
  }

  function getPid() {
    return typeof window.__IAP_PRODUCT_ID__ === "string" ? window.__IAP_PRODUCT_ID__ : "";
  }

  async function init() {
    if (!enabled()) return { ok: false, reason: "disabled" };
    if (window.__iapInitDone) return { ok: true, reason: "already" };
    const store = window.store;
    const pid = getPid();
    if (!pid) return { ok: false, reason: "missing product id" };

    try {
      store.verbosity = store.DEBUG || 1;

      store.register({
        id: pid,
        type: store.ProductType ? store.ProductType.NON_CONSUMABLE : "non consumable",
        platform: store.Platform ? store.Platform.APPLE_APPSTORE : "apple-appstore",
      });

      store.when().approved((p) => {
        if (p && p.id === pid) {
          try {
            p.finish();
          } catch {
            /* ignore */
          }
          try {
            sessionStorage.setItem("tz_premium_active", "1");
          } catch {
            /* ignore */
          }
          if (typeof window.__applyPremiumUI === "function") window.__applyPremiumUI();
        }
      });

      store.when().productUpdated((p) => {
        if (p && p.id === pid) {
          try {
            if (p.owned) sessionStorage.setItem("tz_premium_active", "1");
            else sessionStorage.removeItem("tz_premium_active");
          } catch {
            /* ignore */
          }
          if (typeof window.__applyPremiumUI === "function") window.__applyPremiumUI();
        }
      });

      // Some versions require explicit initialization.
      if (typeof store.initialize === "function") {
        await store.initialize([store.Platform ? store.Platform.APPLE_APPSTORE : "apple-appstore"]);
      }

      store.refresh();
      window.__iapInitDone = true;
      return { ok: true };
    } catch (e) {
      console.warn("IAP init failed", e);
      return { ok: false, reason: "exception" };
    }
  }

  async function purchase() {
    const r = await init();
    if (!r.ok) throw new Error("iap_init_failed");
    const store = window.store;
    const pid = getPid();
    const product = store.get(pid);
    const offer = product && typeof product.getOffer === "function" ? product.getOffer() : null;
    if (!offer || typeof offer.order !== "function") throw new Error("no_offer");
    return offer.order();
  }

  async function restore() {
    const r = await init();
    if (!r.ok) throw new Error("iap_init_failed");
    try {
      window.store.refresh();
      return true;
    } catch {
      return false;
    }
  }

  window.TZM = window.TZM || {};
  window.TZM.iap = { init, purchase, restore, enabled };
})();

