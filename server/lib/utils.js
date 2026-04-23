const crypto = require("crypto");
const { CONFIG } = require("./config");

function stringify(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeStudentId(value) {
  const digits = stringify(value).replace(/\D/g, "");
  return digits ? digits.padStart(6, "0") : "";
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function pacificToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftLocalDateString(localDate, dayDelta) {
  const [year, month, day] = String(localDate || "").split("-").map(Number);
  if (!year || !month || !day) {
    return "";
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return date.toISOString().slice(0, 10);
}

function getRangeBounds(range) {
  const current = stringify(range).toLowerCase() || "overall";
  const today = pacificToday();

  if (current === "overall") {
    return { start: "", end: today };
  }

  if (current === "month") {
    return { start: `${today.slice(0, 8)}01`, end: today };
  }

  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: CONFIG.timezone,
    weekday: "short"
  }).format(new Date());
  const weekday = weekdayMap[label] || 1;

  return {
    start: shiftLocalDateString(today, -(weekday - 1)),
    end: today
  };
}

function isLocalDateInRange(localDate, bounds) {
  const value = stringify(localDate);
  if (!value) {
    return false;
  }
  if (!bounds) {
    return true;
  }

  if (bounds.start && value < bounds.start) {
    return false;
  }
  if (bounds.end && value > bounds.end) {
    return false;
  }
  return true;
}

function shortDateLabel(localDate) {
  const [year, month, day] = String(localDate || "").split("-").map(Number);
  if (!year || !month || !day) {
    return String(localDate || "");
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function buildDateSpan(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) {
    return [];
  }

  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = shiftLocalDateString(cursor, 1);
  }
  return dates;
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function safeEqualHash(actualHex, expectedHex) {
  const a = Buffer.from(String(actualHex || ""), "hex");
  const b = Buffer.from(String(expectedHex || ""), "hex");
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  stringify,
  normalizeStudentId,
  toNumber,
  round,
  pacificToday,
  shiftLocalDateString,
  getRangeBounds,
  isLocalDateInRange,
  shortDateLabel,
  buildDateSpan,
  sha256Hex,
  safeEqualHash
};
