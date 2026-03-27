const cityInputA = document.getElementById("cityInputA");
const cityInputB = document.getElementById("cityInputB");
const suggestListA = document.getElementById("suggestListA");
const suggestListB = document.getElementById("suggestListB");
const scheduleBtn = document.getElementById("scheduleBtn");
const scheduleResults = document.getElementById("scheduleResults");

let selectedA = null;
let selectedB = null;
let durationMinutes = 60;
let timerA = null;
let timerB = null;

function apiBase() {
  return window.TZM ? window.TZM.getApiBase() : "";
}

function fetchHeaders(isJson) {
  const h = { ...window.TZM.authHeaders() };
  if (isJson) h["Content-Type"] = "application/json";
  return h;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchSuggestions(q) {
  const base = apiBase();
  const res = await fetch(`${base}/api/suggest?q=${encodeURIComponent(q)}&limit=10`, {
    headers: fetchHeaders(false),
  });
  return res.json();
}

function bindSuggest(input, listEl, onPick) {
  function showSuggestions(items) {
    if (!items || items.length === 0) {
      listEl.style.display = "none";
      listEl.innerHTML = "";
      return;
    }
    listEl.innerHTML = items
      .map(
        (s, idx) =>
          `<div class="item" data-idx="${idx}">
            <div>${escapeHtml(s.name)} <small>${escapeHtml(s.country)}</small></div>
          </div>`
      )
      .join("");
    listEl.style.display = "block";
    Array.from(listEl.querySelectorAll(".item")).forEach((el) => {
      el.addEventListener("click", () => {
        const idx = Number(el.getAttribute("data-idx"));
        onPick(items[idx]);
        listEl.style.display = "none";
        listEl.innerHTML = "";
      });
    });
  }

  function hide() {
    listEl.style.display = "none";
    listEl.innerHTML = "";
  }

  input.addEventListener("input", () => {
    onPick(null);
    const q = input.value.trim();
    if (!q) {
      hide();
      return;
    }
    if (input === cityInputA) {
      clearTimeout(timerA);
      timerA = setTimeout(async () => {
        try {
          const data = await fetchSuggestions(q);
          showSuggestions(data.suggestions);
        } catch {
          hide();
        }
      }, 200);
    } else {
      clearTimeout(timerB);
      timerB = setTimeout(async () => {
        try {
          const data = await fetchSuggestions(q);
          showSuggestions(data.suggestions);
        } catch {
          hide();
        }
      }, 200);
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });

  return hide;
}

const hideA = bindSuggest(cityInputA, suggestListA, (choice) => {
  selectedA = choice;
  if (choice) cityInputA.value = choice.name;
});
const hideB = bindSuggest(cityInputB, suggestListB, (choice) => {
  selectedB = choice;
  if (choice) cityInputB.value = choice.name;
});

document.addEventListener("click", (e) => {
  if (!suggestListA.contains(e.target) && e.target !== cityInputA) hideA();
  if (!suggestListB.contains(e.target) && e.target !== cityInputB) hideB();
});

document.querySelectorAll(".dur-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dur-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    durationMinutes = Number(btn.getAttribute("data-dur")) || 60;
  });
});

function payloadForCity(input, selected) {
  const raw = input.value.trim();
  if (!raw) return null;
  if (selected && selected.name.toLowerCase() === raw.toLowerCase()) {
    return { city: selected.name, country: selected.country };
  }
  return { city: raw };
}

function renderSlot(slot, compromise) {
  const { sideA, sideB, flags } = slot;
  const badges = [];
  if (flags.differentCalendarDay) {
    badges.push(`<span class="badge info">Different calendar day between locations</span>`);
  }
  if (flags.weekendA) {
    badges.push(
      `<span class="badge warn">Weekend in ${escapeHtml(sideA.city)}</span>`
    );
  }
  if (flags.weekendB) {
    badges.push(
      `<span class="badge warn">Weekend in ${escapeHtml(sideB.city)}</span>`
    );
  }
  const pen =
    compromise && typeof slot.penalty === "number"
      ? `<div class="muted" style="margin-top:0.35rem;font-size:0.85rem;">Approx. distance from preferred hours (lower is better): ${escapeHtml(
          String(slot.penalty)
        )}</div>`
      : "";

  return `
    <div class="slot ${compromise ? "compromise" : ""}">
      <div class="slot-title">${escapeHtml(sideA.dateLabel)}</div>
      <div class="slot-side">
        <strong>${escapeHtml(sideA.city)}</strong> (${escapeHtml(sideA.country)}):
        ${escapeHtml(sideA.timeRange)}
        <br /><code>${escapeHtml(sideA.timezone)}</code>
      </div>
      <div class="slot-side">
        <strong>${escapeHtml(sideB.city)}</strong> (${escapeHtml(sideB.country)}):
        ${escapeHtml(sideB.timeRange)}
        <br /><code>${escapeHtml(sideB.timezone)}</code>
      </div>
      ${badges.length ? `<div class="badges">${badges.join("")}</div>` : ""}
      ${pen}
    </div>
  `;
}

scheduleBtn.addEventListener("click", async () => {
  hideA();
  hideB();
  const pa = payloadForCity(cityInputA, selectedA);
  const pb = payloadForCity(cityInputB, selectedB);
  if (!pa || !pb) {
    scheduleResults.innerHTML =
      '<span class="muted">Enter and confirm two cities (pick a suggestion when offered).</span>';
    return;
  }

  scheduleBtn.disabled = true;
  scheduleResults.innerHTML = "Finding times…";

  try {
    const base = apiBase();
    const res = await fetch(`${base}/api/schedule`, {
      method: "POST",
      headers: fetchHeaders(true),
      body: JSON.stringify({
        cityA: pa.city,
        countryA: pa.country,
        cityB: pb.city,
        countryB: pb.country,
        durationMinutes,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      scheduleResults.innerHTML = `<span class="muted">Error: ${escapeHtml(data.error || res.statusText)}</span>`;
      return;
    }

    const parts = [];
    if (data.perfect && data.perfect.length) {
      parts.push(
        `<h2 class="section-title">Inside 5am–8pm local (start and end)</h2>` +
          data.perfect.map((s) => renderSlot(s, false)).join("")
      );
    } else {
      parts.push(
        `<p class="muted">No slot in the next 14 days keeps both the meeting start and end between 5am and 8pm in both places. Try another length or cities—or use the closest options below.</p>`
      );
    }

    if (data.compromise && data.compromise.length) {
      parts.push(
        `<h2 class="section-title">Closest times (may be outside preferred hours)</h2>` +
          data.compromise.map((s) => renderSlot(s, true)).join("")
      );
    }

    if (!parts.length) {
      scheduleResults.innerHTML = '<span class="muted">No results.</span>';
    } else {
      scheduleResults.innerHTML = parts.join("");
    }
  } catch {
    scheduleResults.innerHTML = '<span class="muted">Request failed.</span>';
  } finally {
    scheduleBtn.disabled = false;
  }
});

if (typeof window.__syncPremium === "function") {
  window.__syncPremium().catch(() => {});
}
