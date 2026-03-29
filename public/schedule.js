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

function dispCity(name, cc) {
  return window.TZMLocale ? window.TZMLocale.formatCity(name, cc) : name;
}

function dispCc(cc) {
  return window.TZMLocale ? window.TZMLocale.formatCountry(cc) : cc;
}

function t(key, fallback, vars) {
  return window.tzT ? window.tzT(key, fallback, vars) : fallback;
}

async function fetchSuggestions(q) {
  const base = apiBase();
  const qq = window.TZMLocale?.resolveSpanishSuggestQuery
    ? window.TZMLocale.resolveSpanishSuggestQuery(q)
    : q;
  const res = await fetch(`${base}/api/suggest?q=${encodeURIComponent(qq)}&limit=10`, {
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
            <div>${escapeHtml(dispCity(s.name, s.country))} <small>${escapeHtml(dispCc(s.country))}</small></div>
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
  if (choice) cityInputA.value = dispCity(choice.name, choice.country);
});
const hideB = bindSuggest(cityInputB, suggestListB, (choice) => {
  selectedB = choice;
  if (choice) cityInputB.value = dispCity(choice.name, choice.country);
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
  const useSelected =
    selected &&
    (window.TZMLocale
      ? window.TZMLocale.matchesCityInput(raw, selected)
      : selected.name.toLowerCase() === raw.toLowerCase());
  if (useSelected) {
    return { city: selected.name, country: selected.country };
  }
  return {
    city: window.TZMLocale?.resolveSpanishCityName
      ? window.TZMLocale.resolveSpanishCityName(raw)
      : raw,
  };
}

function formatSideTimes(side) {
  const sameLocalDay = side.localDate === side.localDateEnd;
  const ts = escapeHtml(side.timeStart);
  const te = escapeHtml(side.timeEnd);
  const d1 = escapeHtml(side.dateLabel);
  const d2 = escapeHtml(side.dateEndLabel);
  const loc = t("localClockSuffix", "local");
  if (sameLocalDay) {
    const inner = t("slotSameDay", "{d1}: <strong>{ts}</strong> → <strong>{te}</strong> {loc}", { d1, ts, te, loc });
    return `<div class="slot-times">${inner}</div>`;
  }
  const startInner = t("slotStart", "Start: {d1} at <strong>{ts}</strong> {loc}", { d1, ts, loc });
  const endInner = t("slotEnd", "End: {d2} at <strong>{te}</strong> {loc}", { d2, te, loc });
  return `<div class="slot-times">${startInner}</div>` + `<div class="slot-times">${endInner}</div>`;
}

function renderSlot(slot, compromise) {
  const { sideA, sideB, flags } = slot;
  const badges = [];
  if (flags.differentCalendarDay) {
    badges.push(`<span class="badge info">${t("badgeDifferentDay", "Different calendar day between locations")}</span>`);
  }
  if (flags.weekendA) {
    badges.push(
      `<span class="badge warn">${t("badgeWeekend", "Weekend in {city}", { city: dispCity(sideA.city, sideA.country) })}</span>`
    );
  }
  if (flags.weekendB) {
    badges.push(
      `<span class="badge warn">${t("badgeWeekend", "Weekend in {city}", { city: dispCity(sideB.city, sideB.country) })}</span>`
    );
  }
  const pen =
    compromise && typeof slot.penalty === "number"
      ? `<div class="muted" style="margin-top:0.35rem;font-size:0.85rem;">${t(
          "penaltyLine",
          "Approx. distance from preferred hours (lower is better): {value}",
          { value: String(slot.penalty) }
        )}</div>`
      : "";

  return `
    <div class="slot ${compromise ? "compromise" : ""}">
      <div class="slot-title">${t("slotTitleBoth", "Both locations (same moment)")}</div>
      <div class="slot-side">
        <div class="slot-loc"><strong>${escapeHtml(dispCity(sideA.city, sideA.country))}</strong> (${escapeHtml(dispCc(sideA.country))})</div>
        ${formatSideTimes(sideA)}
        <div class="slot-tz"><code>${escapeHtml(sideA.timezone)}</code></div>
      </div>
      <div class="slot-side">
        <div class="slot-loc"><strong>${escapeHtml(dispCity(sideB.city, sideB.country))}</strong> (${escapeHtml(dispCc(sideB.country))})</div>
        ${formatSideTimes(sideB)}
        <div class="slot-tz"><code>${escapeHtml(sideB.timezone)}</code></div>
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
      '<span class="muted">' + t("enterTwoCities", "Enter and confirm two cities (pick a suggestion when offered).") + "</span>";
    return;
  }

  scheduleBtn.disabled = true;
  scheduleResults.innerHTML = t("findingTimes", "Finding times…");

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
      const errRaw = data.error || res.statusText;
      scheduleResults.innerHTML =
        '<span class="muted">' +
        t("errorWithDetail", "Error: {detail}", { detail: escapeHtml(errRaw) }) +
        "</span>";
      return;
    }

    const horizon = Number(data.horizonDays) || 5;
    const daysWord = horizon === 1 ? t("daySingular", "day") : t("dayPlural", "days");
    const parts = [
      `<p class="muted slot-intro">${t("slotIntroHtml", "Same moment shown as <strong>local start → local end</strong> in each place. Search window: <strong>{horizon} {daysWord}</strong>.", {
        horizon: String(horizon),
        daysWord,
      })}</p>`,
    ];
    if (data.perfect && data.perfect.length) {
      parts.push(
        `<h2 class="section-title">${t(
          "sectionGoodFit",
          "Good fit — neither side before 5am or after 8pm local (whole meeting)"
        )}</h2>` + data.perfect.map((s) => renderSlot(s, false)).join("")
      );
    } else {
      parts.push(
        `<p class="muted">${t(
          "sectionNoPerfect",
          "No slot in the next {horizon} {daysWord} keeps both places off the call before 5am or after 8pm local for the full length. Try another duration or cities—or see the closest options below.",
          { horizon: String(horizon), daysWord }
        )}</p>`
      );
    }

    if (data.compromise && data.compromise.length) {
      parts.push(
        `<h2 class="section-title">${t("sectionCompromise", "Closest alternatives (may be early or late locally)")}</h2>` +
          data.compromise.map((s) => renderSlot(s, true)).join("")
      );
    }

    if (!parts.length) {
      scheduleResults.innerHTML = '<span class="muted">' + t("noResults", "No results.") + "</span>";
    } else {
      scheduleResults.innerHTML = parts.join("");
    }
  } catch {
    scheduleResults.innerHTML = '<span class="muted">' + t("requestFailed", "Request failed.") + "</span>";
  } finally {
    scheduleBtn.disabled = false;
  }
});

if (typeof window.__syncPremium === "function") {
  window.__syncPremium().catch(() => {});
}
