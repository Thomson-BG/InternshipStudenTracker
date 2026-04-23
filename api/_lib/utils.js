const crypto = require("node:crypto");

function stringify(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function roundTo(value, places) {
  const factor = 10 ** (places || 0);
  return Math.round(Number(value || 0) * factor) / factor;
}

function normalizeStudentId(value) {
  const studentId = stringify(value);
  return /^\d+$/.test(studentId) ? studentId.padStart(6, "0") : studentId;
}

function isLocalDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(stringify(value));
}

function formatLocalDate(dateObj, timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(dateObj).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeLocalDateCell(value, timeZone = "America/Los_Angeles") {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // DATE columns should round-trip without timezone shifts.
    return value.toISOString().slice(0, 10);
  }

  const text = stringify(value);
  if (!text) {
    return "";
  }

  if (isLocalDateString(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
    return formatLocalDate(parsed, timeZone);
  }

  return "";
}

function normalizeUtcTimestampCell(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const text = stringify(value);
  if (!text) {
    return "";
  }

  if (isLocalDateString(text)) {
    const dayStamp = new Date(`${text}T00:00:00Z`);
    return Number.isNaN(dayStamp.getTime()) ? "" : dayStamp.toISOString();
  }

  const parsed = new Date(text);
  if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return "";
}

function coerceNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : "";
}

function coerceCoordinate(value, min, max) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    return "";
  }
  return numberValue;
}

function parseJsonSafe(raw) {
  if (!raw) {
    return {};
  }
  if (typeof raw === "object") {
    return raw;
  }
  if (typeof raw !== "string") {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function shiftLocalDateString(localDate, dayDelta) {
  const [year, month, day] = String(localDate || "").split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return "";
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return date.toISOString().slice(0, 10);
}

function shortDateLabel(localDate) {
  const date = new Date(`${localDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return stringify(localDate);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function rangeLabel(range) {
  if (range === "week") {
    return "This Week";
  }
  if (range === "month") {
    return "This Month";
  }
  return "Overall";
}

function siteLabel(site) {
  return !site || site === "all" ? "All Sites" : site;
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

function buildHeaderIndex(headers) {
  const index = {};
  headers.forEach((header, position) => {
    const normalized = stringify(header).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalized) {
      index[normalized] = position;
    }
  });
  return index;
}

function getCellByHeader(row, index, header, fallbackIndex = -1) {
  const normalizedHeader = stringify(header).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (Object.prototype.hasOwnProperty.call(index, normalizedHeader)) {
    return row[index[normalizedHeader]];
  }
  return fallbackIndex >= 0 ? row[fallbackIndex] : "";
}

module.exports = {
  buildDateSpan,
  buildHeaderIndex,
  coerceCoordinate,
  coerceNumber,
  getCellByHeader,
  isLocalDateString,
  normalizeLocalDateCell,
  normalizeStudentId,
  normalizeUtcTimestampCell,
  parseJsonSafe,
  rangeLabel,
  roundTo,
  sha256Hex,
  shiftLocalDateString,
  shortDateLabel,
  siteLabel,
  stringify,
  formatLocalDate
};
