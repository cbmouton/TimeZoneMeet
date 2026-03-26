(function () {
  function isNativeIOS() {
    const c = window.Capacitor;
    return Boolean(c && typeof c.getPlatform === "function" && c.getPlatform() === "ios");
  }

  function getAdMobPlugin() {
    const c = window.Capacitor;
    return c && c.Plugins ? c.Plugins.AdMob : null;
  }

  async function hideAdMobBanner() {
    const plugin = getAdMobPlugin();
    if (!plugin || typeof plugin.hideBanner !== "function") return;
    try {
      await plugin.hideBanner();
    } catch (e) {
      console.warn("AdMob hideBanner failed", e);
    }
  }

  async function initAdMobBanner() {
    if (!isNativeIOS()) return;
    if (!window.__ADMOB_ENABLED__) return;
    if (isPremium()) return;
    if (window.__admobShown) return;

    const plugin = getAdMobPlugin();
    if (!plugin) {
      console.warn("AdMob plugin not available");
      return;
    }

    const testMode = Boolean(window.__ADMOB_TEST_MODE__);
    const bannerId =
      window.__ADMOB_BANNER_ID__ || "ca-app-pub-3940256099942544/2435281174";

    try {
      if (typeof plugin.initialize === "function") {
        await plugin.initialize({ initializeForTesting: testMode });
      }
      if (typeof plugin.showBanner === "function") {
        await plugin.showBanner({
          adId: bannerId,
          adSize: "BANNER",
          position: "BOTTOM_CENTER",
          margin: 0,
          isTesting: testMode,
        });
      }
      window.__admobShown = true;
    } catch (e) {
      console.warn("AdMob banner failed", e);
    }
  }

  function isPremium() {
    try {
      return sessionStorage.getItem("tz_premium_active") === "1";
    } catch {
      return false;
    }
  }

  function showAdSlots() {
    document.querySelectorAll(".ad-slot").forEach((el) => {
      el.style.display = "";
    });
  }

  function hideAdSlots() {
    document.querySelectorAll(".ad-slot").forEach((el) => {
      el.style.display = "none";
    });
  }

  window.__applyPremiumUI = function () {
    const premium = isPremium();
    const goPremium = document.getElementById("goPremiumBtn");
    const manage = document.getElementById("premiumActiveNote");
    const signOut = document.getElementById("premiumSignOutBtn");

    if (premium) {
      hideAdSlots();
      if (isNativeIOS()) hideAdMobBanner();
      if (goPremium) goPremium.style.display = "none";
      if (manage) manage.style.display = "inline";
      if (signOut) signOut.style.display = isNativeIOS() ? "none" : "inline";
    } else {
      if (isNativeIOS()) {
        hideAdSlots();
        initAdMobBanner();
      } else {
        showAdSlots();
      }
      if (goPremium) goPremium.style.display = "inline";
      if (manage) manage.style.display = "none";
      if (signOut) {
        if (isNativeIOS() && window.__IAP_ENABLED__) {
          signOut.textContent = "Restore Purchases";
          signOut.style.display = "inline";
        } else {
          signOut.style.display = "none";
        }
      }
      if (!isNativeIOS()) initAdsense();
    }
  };

  function initAdsense() {
    if (isPremium()) return;
    if (window.__adsenseLoaded) return;
    const client = window.__ADSENSE_CLIENT__;
    const slot = window.__ADSENSE_SLOT__;
    if (!client || !slot) return;

    window.__adsenseLoaded = true;
    const expectedSrc =
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
      encodeURIComponent(client);
    const already = Array.from(document.scripts).some((el) => el.src === expectedSrc);
    if (already) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.warn("AdSense push failed", e);
      }
      return;
    }

    const s = document.createElement("script");
    s.async = true;
    s.src = expectedSrc;
    s.crossOrigin = "anonymous";
    s.onload = function () {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.warn("AdSense push failed", e);
      }
    };
    document.head.appendChild(s);
  }
})();
