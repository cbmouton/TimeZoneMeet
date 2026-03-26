(function () {
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
      if (goPremium) goPremium.style.display = "none";
      if (manage) manage.style.display = "inline";
      if (signOut) signOut.style.display = "inline";
    } else {
      showAdSlots();
      if (goPremium) goPremium.style.display = "inline";
      if (manage) manage.style.display = "none";
      if (signOut) signOut.style.display = "none";
      initAdsense();
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
