export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const radiusKm = 6371;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLon = toRad(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c * 1000;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function round(value, places = 0) {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function formatPoints(value) {
  return `${round(value, 1).toLocaleString()} pts`;
}

export function formatHours(value) {
  return `${round(value, 2).toLocaleString()} hrs`;
}

export function formatPercent(value) {
  return `${round(value, 1)}%`;
}

export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric"
  });
}

export function formatTimeOnly(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatCountdownMinutes(isoValue) {
  if (!isoValue) return "";
  const ms = new Date(isoValue).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Now";
  return `${Math.ceil(ms / 60000)} min`;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function readJsonStorage(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

export function writeJsonStorage(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

export function statusTone(status) {
  if (["COMPLETE", "BACKFILLED_COMPLETE", "COMPLETED"].includes(status)) return "success";
  if (["CHECKED_IN", "OPEN"].includes(status)) return "warning";
  if (["EXCEPTION", "AUTH_REQUIRED", "ALREADY_CHECKED_IN", "ALREADY_CHECKED_OUT", "INVALID_CREDENTIALS"].includes(status)) return "danger";
  if (status === "FAILED_TO_CHECKOUT") return "blue";
  return "info";
}

export function toRangeLabel(range) {
  if (range === "week") return "This Week";
  if (range === "month") return "This Month";
  return "Overall";
}

export function debounce(fn, wait = 250) {
  let timeout = null;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

export function downloadCsv(filename, headers, rows) {
  const csvRows = [headers.join(",")].concat(
    rows.map((row) =>
      row.map((value) => {
        const text = String(value ?? "").replace(/\"/g, '""');
        return /[",\n]/.test(text) ? `"${text}"` : text;
      }).join(",")
    )
  );
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function percentileLabel(value) {
  const numeric = round(Number(value) || 0, 1);
  if (numeric >= 99.9) return "Top performer";
  if (numeric <= 0) return "Needs more logged progress";
  return `Ahead of ${numeric}% of cohort`;
}

export function makeRangeMetricsCopy(summary) {
  if (!summary) return "No data yet.";
  return `${formatPoints(summary.points)} / ${formatHours(summary.hours)}`;
}

export function computeGaugeDash(percent, radius = 46) {
  const circumference = 2 * Math.PI * radius;
  const clamped = clamp(Number(percent) || 0, 0, 100);
  return {
    circumference,
    offset: circumference - (clamped / 100) * circumference
  };
}

export function buildMapLink(lat, lng) {
  if (lat === "" || lng === "" || lat === null || lng === null || lat === undefined || lng === undefined) {
    return "";
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}
