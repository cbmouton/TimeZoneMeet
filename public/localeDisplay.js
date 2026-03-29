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

  /** Lowercase + strip accents so "bogota" matches "Bogotá" Spanish keys. */
  function fold(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  let searchPairsCache = null;
  function getSpanishSearchPairs() {
    if (searchPairsCache) return searchPairsCache;
    searchPairsCache = Object.entries(cityMap)
      .map(([k, v]) => ({ es: fold(v), en: k.split("|")[0] }))
      .filter((p) => p.es.length > 0)
      .sort((a, b) => b.es.length - a.es.length);
    return searchPairsCache;
  }

  /**
   * Map Spanish search text (e.g. "nueva york") to GeoNames English ("New York") for /api/suggest and lookup.
   * Longest Spanish phrase matched first (prefix), so "nueva" resolves to New York before shorter keys.
   */
  function resolveSpanishSuggestQuery(q) {
    if (lang !== "es" || !q || typeof q !== "string") return q;
    const ql = fold(q.trim());
    if (!ql) return q;
    const pairs = getSpanishSearchPairs();
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i].es === ql) return pairs[i].en;
    }
    if (ql.length < 2) return q;
    for (let i = 0; i < pairs.length; i++) {
      if (pairs[i].es.startsWith(ql)) return pairs[i].en;
    }
    return q;
  }

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
    if (fold(selected.name) === fold(t)) return true;
    const disp = formatCity(selected.name, selected.country);
    return fold(disp) === fold(t);
  }

  window.TZMLocale = {
    formatCountry,
    formatCity,
    matchesCityInput,
    resolveSpanishSuggestQuery,
    resolveSpanishCityName: resolveSpanishSuggestQuery,
    lang,
  };
})();
