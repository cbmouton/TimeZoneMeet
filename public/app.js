const input = document.getElementById("cityInput");
const resultDiv = document.getElementById("result");
const metaDiv = document.getElementById("meta");
const suggestList = document.getElementById("suggestList");
const lookupBtn = document.getElementById("lookupBtn");
const clearBtn = document.getElementById("clearBtn");

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

  resultDiv.textContent = "Loading...";
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
      resultDiv.textContent = `Error: ${data.error}`;
      return;
    }

    resultDiv.textContent = `Local time in ${data.city}: ${data.time} (${data.timezone})`;
    metaDiv.textContent = `Matched: ${data.city}, ${data.country}`;
  } catch (err) {
    resultDiv.textContent = "Request failed.";
  }
}

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

const goPremiumBtn = document.getElementById("goPremiumBtn");
if (goPremiumBtn) {
  goPremiumBtn.addEventListener("click", async () => {
    const base = apiBase();
    const url = `${base}/api/create-checkout-session`;
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
          `Checkout failed (HTTP ${res.status}). The server did not return JSON — often a bad deploy, wrong URL, or Railway error page. Open Railway logs and confirm STRIPE_SECRET_KEY and STRIPE_PRICE_ID are set.`
        );
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      const msg = [data.error, data.detail].filter(Boolean).join(" — ");
      alert(msg || "Premium checkout is not configured on the server.");
    } catch (e) {
      alert(
        `Network error calling ${url}. If the site is on Railway, check that __API_BASE__ in config.js is "" (same host) or your full https:// URL.`
      );
    }
  });
}

const premiumSignOutBtn = document.getElementById("premiumSignOutBtn");
if (premiumSignOutBtn) {
  premiumSignOutBtn.addEventListener("click", () => {
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
