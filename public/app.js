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

  // Click handlers
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

const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) ? window.__API_BASE__.replace(/\/$/, '') : '';

async function fetchSuggestions(q) {
  const url = `${API_BASE}/api/suggest?q=${encodeURIComponent(q)}&limit=10`;
  const res = await fetch(url);
  return await res.json();
}

async function lookup() {
  const raw = input.value.trim();
  if (!raw) return;

  resultDiv.textContent = "Loading...";
  metaDiv.textContent = "";

  const payload = selected && selected.name.toLowerCase() === raw.toLowerCase()
    ? { city: selected.name, country: selected.country }
    : { city: raw };

  try {
    const response = await fetch(`${API_BASE}/api/timezone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

// Events
input.addEventListener("input", () => {
  selected = null; // user is typing, so clear any prior selection

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
