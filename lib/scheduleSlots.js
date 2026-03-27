/**
 * Find meeting start times where both endpoints fall in [05:00, 20:00] local
 * in each of two IANA time zones (inclusive end at 20:00).
 */

const WINDOW_START_MIN = 5 * 60; // 05:00
const WINDOW_END_MIN = 20 * 60; // 20:00

function localMinutesFromMidnight(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let h = 0;
  let m = 0;
  for (const p of dtf.formatToParts(date)) {
    if (p.type === "hour") h = Number(p.value);
    if (p.type === "minute") m = Number(p.value);
  }
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

function boundaryPenalty(mins) {
  if (!Number.isFinite(mins)) return 1e9;
  if (mins < WINDOW_START_MIN) return WINDOW_START_MIN - mins;
  if (mins > WINDOW_END_MIN) return mins - WINDOW_END_MIN;
  return 0;
}

function zonePenalty(tStart, tEnd, timeZone) {
  const m0 = localMinutesFromMidnight(tStart, timeZone);
  const m1 = localMinutesFromMidnight(tEnd, timeZone);
  return boundaryPenalty(m0) + boundaryPenalty(m1);
}

function totalPenalty(tStart, tEnd, tzA, tzB) {
  return zonePenalty(tStart, tEnd, tzA) + zonePenalty(tStart, tEnd, tzB);
}

function localDateKey(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isWeekend(date, timeZone) {
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  return w === "Sat" || w === "Sun";
}

function formatTime(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatLongDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function buildSide(dateStart, dateEnd, city, country, timeZone) {
  const weekend = isWeekend(dateStart, timeZone) || isWeekend(dateEnd, timeZone);
  const dateLabel = formatLongDate(dateStart, timeZone);
  const dateEndLabel = formatLongDate(dateEnd, timeZone);
  const localDate = localDateKey(dateStart, timeZone);
  const localDateEnd = localDateKey(dateEnd, timeZone);
  const timeStart = formatTime(dateStart, timeZone);
  const timeEnd = formatTime(dateEnd, timeZone);
  return {
    city,
    country,
    timezone: timeZone,
    localDate,
    localDateEnd,
    dateLabel,
    dateEndLabel,
    timeStart,
    timeEnd,
    timeRange: `${timeStart} – ${timeEnd}`,
    weekend,
  };
}

/**
 * @param {object} p
 * @param {string} p.tzA
 * @param {string} p.tzB
 * @param {string} p.cityA
 * @param {string} p.countryA
 * @param {string} p.cityB
 * @param {string} p.countryB
 * @param {number} p.durationMinutes
 * @param {number} [p.horizonDays=5]
 * @param {number} [p.stepMinutes=15]
 * @param {number} [p.maxPerfect=8]
 * @param {number} [p.maxCompromise=5]
 */
export function findScheduleSlots({
  tzA,
  tzB,
  cityA,
  countryA,
  cityB,
  countryB,
  durationMinutes,
  horizonDays = 5,
  stepMinutes = 15,
  maxPerfect = 8,
  maxCompromise = 5,
}) {
  const durationMs = durationMinutes * 60 * 1000;
  const stepMs = stepMinutes * 60 * 1000;
  const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const endSearch = now + horizonMs;

  let t = Math.ceil(now / stepMs) * stepMs;

  const perfect = [];
  const compromiseCandidates = [];

  while (t + durationMs <= endSearch) {
    const tStart = new Date(t);
    const tEnd = new Date(t + durationMs);
    const p = totalPenalty(tStart, tEnd, tzA, tzB);

    const dateKeyA = localDateKey(tStart, tzA);
    const dateKeyB = localDateKey(tStart, tzB);
    const differentCalendarDay = dateKeyA !== dateKeyB;

    const sideA = buildSide(tStart, tEnd, cityA, countryA, tzA);
    const sideB = buildSide(tStart, tEnd, cityB, countryB, tzB);

    const slot = {
      startUtc: tStart.toISOString(),
      endUtc: tEnd.toISOString(),
      sideA,
      sideB,
      flags: {
        differentCalendarDay,
        weekendA: sideA.weekend,
        weekendB: sideB.weekend,
      },
    };

    if (p === 0) {
      if (perfect.length < maxPerfect) {
        perfect.push({ ...slot, compromise: false });
      }
    } else {
      compromiseCandidates.push({ slot: { ...slot, compromise: true }, penalty: p });
    }

    t += stepMs;
  }

  compromiseCandidates.sort((a, b) => a.penalty - b.penalty || a.slot.startUtc.localeCompare(b.slot.startUtc));
  const compromise = compromiseCandidates.slice(0, maxCompromise).map((c) => ({
    ...c.slot,
    penalty: Math.round(c.penalty),
  }));

  return {
    durationMinutes,
    horizonDays,
    perfect,
    compromise,
  };
}
