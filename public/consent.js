(function () {
  var CONSENT_KEY = "tz_cookie_consent_v1";
  var MEASUREMENT_ID = "G-CMXGFGTKLT";

  function getStoredConsent() {
    try {
      return localStorage.getItem(CONSENT_KEY) || "";
    } catch {
      return "";
    }
  }

  function setStoredConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /* ignore */
    }
  }

  function setupGtagStub() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  }

  function setConsentDefaultDenied() {
    setupGtagStub();
    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      wait_for_update: 500,
    });
  }

  function updateConsentGranted() {
    setupGtagStub();
    window.gtag("consent", "update", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
    });
  }

  function updateConsentDenied() {
    setupGtagStub();
    window.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  }

  function loadAnalyticsIfNeeded() {
    if (window.__tzAnalyticsLoaded) return;
    window.__tzAnalyticsLoaded = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MEASUREMENT_ID);
    s.onload = function () {
      setupGtagStub();
      window.gtag("js", new Date());
      window.gtag("config", MEASUREMENT_ID, { anonymize_ip: true });
    };
    document.head.appendChild(s);
  }

  function hasConsent() {
    return getStoredConsent() === "accept";
  }

  function dispatchConsentChange() {
    try {
      window.dispatchEvent(
        new CustomEvent("tz-consent-changed", { detail: { accepted: hasConsent() } })
      );
    } catch {
      /* ignore */
    }
  }

  function applyConsent(value, persist) {
    if (persist) setStoredConsent(value);
    if (value === "accept") {
      updateConsentGranted();
      loadAnalyticsIfNeeded();
    } else {
      updateConsentDenied();
    }
    dispatchConsentChange();
  }

  function injectBannerStyles() {
    if (document.getElementById("tz-consent-style")) return;
    var style = document.createElement("style");
    style.id = "tz-consent-style";
    style.textContent =
      ".tz-consent-banner{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 10px 24px rgba(0,0,0,.15);padding:12px;max-width:760px;margin:0 auto;font:14px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}" +
      ".tz-consent-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}" +
      ".tz-consent-btn{border:1px solid #ccc;background:#f7f7f7;border-radius:8px;padding:8px 10px;cursor:pointer}" +
      ".tz-consent-btn.primary{background:#1a4a8c;color:#fff;border-color:#1a4a8c}" +
      ".tz-consent-banner a{color:#0645ad}";
    document.head.appendChild(style);
  }

  function renderBanner() {
    if (document.getElementById("tz-consent-banner")) return;
    injectBannerStyles();
    var el = document.createElement("div");
    el.id = "tz-consent-banner";
    el.className = "tz-consent-banner";
    el.innerHTML =
      "<div><strong>Privacy & Cookies</strong><br/>We use analytics and ads cookies to improve TimeZoneMeet and support premium features. You can change this later by clearing site data.</div>" +
      "<div class='tz-consent-row'>" +
      "<button type='button' class='tz-consent-btn primary' id='tz-consent-accept'>Accept all</button>" +
      "<button type='button' class='tz-consent-btn' id='tz-consent-reject'>Reject non-essential</button>" +
      "<a class='tz-consent-btn' href='/privacy.html'>Privacy Policy</a>" +
      "</div>";
    document.body.appendChild(el);

    var accept = document.getElementById("tz-consent-accept");
    var reject = document.getElementById("tz-consent-reject");
    if (accept) {
      accept.addEventListener("click", function () {
        applyConsent("accept", true);
        el.remove();
      });
    }
    if (reject) {
      reject.addEventListener("click", function () {
        applyConsent("reject", true);
        el.remove();
      });
    }
  }

  window.__hasAdConsent = hasConsent;
  setConsentDefaultDenied();

  var stored = getStoredConsent();
  if (stored === "accept") {
    applyConsent("accept", false);
  } else if (stored === "reject") {
    applyConsent("reject", false);
  } else {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", renderBanner, { once: true });
    } else {
      renderBanner();
    }
  }
})();

