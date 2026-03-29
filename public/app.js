const input = document.getElementById("cityInput");
const resultDiv = document.getElementById("result");
const metaDiv = document.getElementById("meta");
const suggestList = document.getElementById("suggestList");
const lookupBtn = document.getElementById("lookupBtn");
const clearBtn = document.getElementById("clearBtn");

const hasMainLookup =
  input &&
  resultDiv &&
  metaDiv &&
  suggestList &&
  lookupBtn &&
  clearBtn;

let selected = null; // { name, country }

function showSuggestions(items) {
  if (!items || items.length === 0) {
    suggestList.style.display = "none";
    suggestList.innerHTML = "";
    return;
  }

  suggestList.innerHTML = items
    .map(
      (s, idx) =>
        `<div class="item" data-idx="${idx}">
          <div>${escapeHtml(s.name)} <small>${escapeHtml(s.country)}</small></div>
        </div>`
    )
    .join("");

  suggestList.style.display = "block";

  Array.from(suggestList.querySelectorAll(".item")).forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.getAttribute("data-idx"));
      const choice = items[idx];
      selected = { name: choice.name, country: choice.country };
      input.value = `${choice.name}`;
      hideSuggestions();
      lookup();
    });
  });
}

function hideSuggestions() {
  suggestList.style.display = "none";
  suggestList.innerHTML = "";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let suggestTimer = null;

function apiBase() {
  return window.TZM ? window.TZM.getApiBase() : "";
}

function fetchHeaders(isJson) {
  const h = { ...window.TZM.authHeaders() };
  if (isJson) h["Content-Type"] = "application/json";
  return h;
}

async function fetchSuggestions(q) {
  const base = apiBase();
  const url = `${base}/api/suggest?q=${encodeURIComponent(q)}&limit=10`;
  const res = await fetch(url, { headers: fetchHeaders(false) });
  return await res.json();
}

async function lookup() {
  const raw = input.value.trim();
  if (!raw) return;

  resultDiv.textContent = window.tzT ? window.tzT("loading", "Loading...") : "Loading...";
  metaDiv.textContent = "";

  const payload =
    selected && selected.name.toLowerCase() === raw.toLowerCase()
      ? { city: selected.name, country: selected.country }
      : { city: raw };

  try {
    const base = apiBase();
    const response = await fetch(`${base}/api/timezone`, {
      method: "POST",
      headers: fetchHeaders(true),
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.error) {
      resultDiv.textContent = window.tzT
        ? window.tzT("errorWithDetail", "Error: {detail}", { detail: data.error })
        : `Error: ${data.error}`;
      return;
    }

    resultDiv.textContent = window.tzT
      ? window.tzT("localTimeResult", "Local time in {city}: {time} ({timezone})", {
          city: data.city,
          time: data.time,
          timezone: data.timezone,
        })
      : `Local time in ${data.city}: ${data.time} (${data.timezone})`;
    metaDiv.textContent = window.tzT
      ? window.tzT("matchedLine", "Matched: {city}, {country}", { city: data.city, country: data.country })
      : `Matched: ${data.city}, ${data.country}`;
  } catch (err) {
    resultDiv.textContent = window.tzT ? window.tzT("requestFailed", "Request failed.") : "Request failed.";
  }
}

if (hasMainLookup) {
  input.addEventListener("input", () => {
    selected = null;

    const q = input.value.trim();
    if (!q) {
      hideSuggestions();
      return;
    }

    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(async () => {
      try {
        const data = await fetchSuggestions(q);
        showSuggestions(data.suggestions);
      } catch {
        hideSuggestions();
      }
    }, 200);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      hideSuggestions();
      lookup();
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  });

  document.addEventListener("click", (e) => {
    if (!suggestList.contains(e.target) && e.target !== input) {
      hideSuggestions();
    }
  });

  lookupBtn.addEventListener("click", () => {
    hideSuggestions();
    lookup();
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    selected = null;
    resultDiv.textContent = "";
    metaDiv.textContent = "";
    hideSuggestions();
    input.focus();
  });
}

const goPremiumBtn = document.getElementById("goPremiumBtn");
if (goPremiumBtn) {
  goPremiumBtn.addEventListener("click", async () => {
    const c = window.Capacitor;
    const isIOS = Boolean(c && typeof c.getPlatform === "function" && c.getPlatform() === "ios");
    if (isIOS && window.TZM?.iap?.enabled?.()) {
      try {
        await window.TZM.iap.purchase();
      } catch {
        alert(
          window.tzT
            ? window.tzT(
                "alertIOSPurchase",
                "Could not start Apple purchase flow. Make sure you set a StoreKit Configuration file in the scheme (for Simulator), or create the product in App Store Connect."
              )
            : "Could not start Apple purchase flow. Make sure you set a StoreKit Configuration file in the scheme (for Simulator), or create the product in App Store Connect."
        );
      }
      return;
    }

    const base = apiBase();
    const url = `${base}/api/stripe-session`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: fetchHeaders(true),
        body: "{}",
      });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        alert(
          window.tzT
            ? window.tzT(
                "alertCheckoutJson",
                "Checkout failed (HTTP {status}). The server did not return JSON — wrong API URL, a bad deploy, or an edge/proxy error page. Check GET /health (checkout.ready) and Railway logs.",
                { status: String(res.status) }
              )
            : `Checkout failed (HTTP ${res.status}). The server did not return JSON — wrong API URL, a bad deploy, or an edge/proxy error page. Check GET /health (checkout.ready) and Railway logs.`
        );
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      const msg = [data.error, data.detail].filter(Boolean).join(" — ");
      alert(
        msg ||
          (window.tzT
            ? window.tzT("alertPremiumNotConfigured", "Premium checkout is not configured on the server.")
            : "Premium checkout is not configured on the server.")
      );
    } catch (e) {
      alert(
        window.tzT
          ? window.tzT(
              "alertNetworkPremium",
              'Network error calling {url}. If the site is on Railway, check that __API_BASE__ in config.js is "" (same host) or your full https:// URL.',
              { url: url }
            )
          : `Network error calling ${url}. If the site is on Railway, check that __API_BASE__ in config.js is "" (same host) or your full https:// URL.`
      );
    }
  });
}

const premiumSignOutBtn = document.getElementById("premiumSignOutBtn");
if (premiumSignOutBtn) {
  premiumSignOutBtn.addEventListener("click", () => {
    const c = window.Capacitor;
    const isIOS = Boolean(c && typeof c.getPlatform === "function" && c.getPlatform() === "ios");
    if (isIOS && window.TZM?.iap?.enabled?.()) {
      try {
        window.TZM.iap.restore();
        alert(
          window.tzT
            ? window.tzT(
                "alertRestore",
                "Restoring purchases… If you previously bought Premium, it will re-enable shortly."
              )
            : "Restoring purchases… If you previously bought Premium, it will re-enable shortly."
        );
      } catch {
        alert(
          window.tzT ? window.tzT("alertRestoreFailed", "Restore purchases failed.") : "Restore purchases failed."
        );
      }
      return;
    }
    window.TZM.clearPremiumToken();
    try {
      sessionStorage.removeItem("tz_premium_active");
    } catch {
      /* ignore */
    }
    if (typeof window.__applyPremiumUI === "function") {
      window.__applyPremiumUI();
    }
  });
}
