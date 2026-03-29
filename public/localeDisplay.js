/**
 * Localized labels for place names in the UI. Country codes (ISO 3166-1 alpha-2)
 * use Intl.DisplayNames; city names use optional overrides in locales/cityDisplay.es.js
 * for Spanish exonyms. API requests still use canonical GeoNames names from the server.
 */
(function () {
  const lang = (document.documentElement.getAttribute("lang") || "en").split("-")[0];
  let regionNames = null;
  try {
    if (typeof Intl !== "undefined" && Intl.DisplayNames) {
      const loc = lang === "es" ? "es" : "en";
      regionNames = new Intl.DisplayNames([loc], { type: "region" });
    }
  } catch {
    /* ignore */
  }

  const cityMap = window.__TZM_CITY_DISPLAY_ES__ || {};

  function formatCountry(code) {
    if (!code || typeof code !== "string") return code || "";
    const c = code.trim().toUpperCase();
    if (c.length !== 2) return code;
    try {
      return regionNames ? regionNames.of(c) : code;
    } catch {
      return code;
    }
  }

  function formatCity(name, countryCode) {
    if (!name || lang !== "es") return name;
    const cc = (countryCode || "").toUpperCase();
    const keyPipe = name + "|" + cc;
    if (cityMap[keyPipe]) return cityMap[keyPipe];
    if (cityMap[name]) return cityMap[name];
    return name;
  }

  function matchesCityInput(raw, selected) {
    if (!selected || typeof raw !== "string") return false;
    const t = raw.trim();
    if (!t) return false;
    const low = t.toLowerCase();
    if (selected.name.toLowerCase() === low) return true;
    const disp = formatCity(selected.name, selected.country);
    return disp.toLowerCase() === low;
  }

  window.TZMLocale = {
    formatCountry,
    formatCity,
    matchesCityInput,
    lang,
  };
})();
