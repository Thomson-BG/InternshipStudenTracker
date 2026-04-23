import { API_ENDPOINTS, GOOGLE_SHEET_ID, ROSTER_FALLBACK } from "./config.js";

const SHEET_CACHE_TTL_MS = 15000;
const COMPLETE_STATUSES = new Set(["COMPLETE", "BACKFILLED_COMPLETE", "COMPLETED"]);
const SHEET_CACHE = new Map();

function isStudentDashboardPayloadUsable(data) {
  const studentId = data?.student?.studentId || data?.student?.id;
  return Boolean(studentId && data?.today && (data?.week || data?.summaries?.week));
}

function normalizeStudentDashboardPayload(data, range = "week") {
  if (!data) {
    return data;
  }

  const weekSummary = data.week || data.summaries?.week || {};
  return {
    ...data,
    currentRange: data.currentRange || range,
    student: {
      ...data.student,
      name: data?.student?.name || data?.student?.studentName || data?.student?.studentId || ""
    },
    week: {
      totalPoints: Number(weekSummary.totalPoints ?? weekSummary.points ?? 0),
      hoursDecimal: Number(weekSummary.hoursDecimal ?? weekSummary.hours ?? 0)
    }
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    payload = {
      ok: false,
      code: "INVALID_RESPONSE",
      message: "Server returned an unreadable response."
    };
  }

  if (!response.ok && payload.ok !== false) {
    payload = {
      ok: false,
      code: "HTTP_ERROR",
      message: `Server error (${response.status}).`
    };
  }

  if (payload && payload.ok === false) {
    throw payload;
  }

  return payload;
}

async function requestText(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw {
      ok: false,
      code: "HTTP_ERROR",
      message: `Server error (${response.status}).`
    };
  }
  return response.text();
}

function buildSheetCsvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function fetchSheetCsv(sheetName, options = {}) {
  const cacheKey = `${sheetName}`;
  const now = Date.now();
  const cached = SHEET_CACHE.get(cacheKey);

  if (!options.forceFresh && cached && cached.data && now - cached.timestamp < SHEET_CACHE_TTL_MS) {
    return cached.data;
  }

  if (!options.forceFresh && cached && cached.promise) {
    return cached.promise;
  }

  const promise = requestText(buildSheetCsvUrl(sheetName), { signal: options.signal })
    .then(parseCsvTable)
    .finally(() => {
      const current = SHEET_CACHE.get(cacheKey);
      if (current && current.promise) {
        delete current.promise;
      }
    });

  SHEET_CACHE.set(cacheKey, {
    timestamp: now,
    promise
  });

  const data = await promise;
  SHEET_CACHE.set(cacheKey, {
    timestamp: Date.now(),
    data
  });
  return data;
}

function parseCsvTable(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      if (row.some((value) => String(value).trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => String(value).trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function buildHeaderIndex(headers) {
  const index = {};
  headers.forEach((header, columnIndex) => {
    index[normalizeHeader(header)] = columnIndex;
  });
  return index;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getCell(row, index, header, fallbackIndex = -1) {
  if (Object.prototype.hasOwnProperty.call(index, header)) {
    return row[index[header]];
  }
  return fallbackIndex >= 0 ? row[fallbackIndex] : "";
}

function normalizeStudentId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(6, "0") : "";
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function pacificToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftLocalDateString(localDate, dayDelta) {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return date.toISOString().slice(0, 10);
}

function getRangeBounds(range) {
  const today = pacificToday();

  if (range === "overall") {
    return { start: "", end: today };
  }

  if (range === "month") {
    return { start: `${today.slice(0, 8)}01`, end: today };
  }

  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short"
  }).format(new Date());
  const weekday = weekdayMap[label] || 1;

  return {
    start: shiftLocalDateString(today, -(weekday - 1)),
    end: today
  };
}

function isLocalDateInRange(localDate, bounds) {
  if (!bounds) {
    return true;
  }
  if (bounds.start && localDate < bounds.start) {
    return false;
  }
  if (bounds.end && localDate > bounds.end) {
    return false;
  }
  return true;
}

function sortShiftsDesc(a, b) {
  if ((a.localDate || "") !== (b.localDate || "")) {
    return (a.localDate || "") < (b.localDate || "") ? 1 : -1;
  }
  const aTime = Date.parse(a.checkOutUtc || a.checkInUtc || "") || 0;
  const bTime = Date.parse(b.checkOutUtc || b.checkInUtc || "") || 0;
  return bTime - aTime;
}

function emptyStudentMetrics(studentId, studentName) {
  return {
    studentId,
    studentName: studentName || studentId,
    points: 0,
    hours: 0,
    completedShifts: 0,
    openShifts: 0,
    exceptionCount: 0,
    activityDays: 0,
    lastActivityUtc: "",
    lastSite: "",
    shiftStatus: "NOT_STARTED",
    topPoints: 0,
    topHours: 0,
    pointsPctOfTop: 0,
    hoursPctOfTop: 0,
    percentile: 0,
    gapToTopPoints: 0,
    gapToTopHours: 0,
    rank: 0,
    studentCount: 0
  };
}

function rankMetrics(rows) {
  const sorted = rows.slice().sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    if (b.hours !== a.hours) {
      return b.hours - a.hours;
    }
    const aTime = a.lastActivityUtc ? new Date(a.lastActivityUtc).getTime() : 0;
    const bTime = b.lastActivityUtc ? new Date(b.lastActivityUtc).getTime() : 0;
    if (bTime !== aTime) {
      return bTime - aTime;
    }
    return a.studentName.localeCompare(b.studentName);
  });

  const topPoints = sorted.length ? Number(sorted[0].points || 0) : 0;
  const topHours = sorted.length ? Number(sorted[0].hours || 0) : 0;
  const count = sorted.length;

  sorted.forEach((row, index) => {
    row.rank = index + 1;
    row.studentCount = count;
    row.topPoints = topPoints;
    row.topHours = topHours;
    row.pointsPctOfTop = topPoints > 0 ? round((row.points / topPoints) * 100, 1) : 0;
    row.hoursPctOfTop = topHours > 0 ? round((row.hours / topHours) * 100, 1) : 0;
    row.gapToTopPoints = round(Math.max(topPoints - row.points, 0), 1);
    row.gapToTopHours = round(Math.max(topHours - row.hours, 0), 2);
    row.percentile = count <= 1 ? 100 : round(((count - row.rank) / (count - 1)) * 100, 1);
    row.points = round(row.points, 1);
    row.hours = round(row.hours, 2);
  });

  return sorted;
}

function buildMetricsByStudent(shifts, studentDirectory) {
  const metrics = {};
  Object.entries(studentDirectory).forEach(([studentId, studentName]) => {
    metrics[studentId] = emptyStudentMetrics(studentId, studentName);
  });

  shifts.forEach((shift) => {
    const studentId = normalizeStudentId(shift.studentId);
    if (!studentId) {
      return;
    }

    if (!metrics[studentId]) {
      metrics[studentId] = emptyStudentMetrics(studentId, shift.studentName || studentId);
    }

    const target = metrics[studentId];
    target.points += toNumber(shift.totalPoints);
    target.hours += toNumber(shift.hoursDecimal);
    if (COMPLETE_STATUSES.has(String(shift.status || "").toUpperCase())) {
      target.completedShifts += 1;
    }
    if (String(shift.status || "").toUpperCase() === "OPEN") {
      target.openShifts += 1;
    }
    if (String(shift.status || "").toUpperCase() === "EXCEPTION") {
      target.exceptionCount += 1;
    }
    target.activityDays += 1;

    const lastActivityUtc = shift.checkOutUtc || shift.checkInUtc || "";
    if (lastActivityUtc && (!target.lastActivityUtc || lastActivityUtc > target.lastActivityUtc)) {
      target.lastActivityUtc = lastActivityUtc;
      target.lastSite = shift.site || "";
      target.shiftStatus = shift.status || "NOT_STARTED";
    }
  });

  const ranked = rankMetrics(Object.values(metrics));
  const lookup = {};
  ranked.forEach((row) => {
    lookup[row.studentId] = row;
  });
  return lookup;
}

function buildStudentDirectory(shifts, roster = null) {
  const directory = { ...ROSTER_FALLBACK, ...(roster || {}) };
  shifts.forEach((shift) => {
    const studentId = normalizeStudentId(shift.studentId);
    if (studentId) {
      directory[studentId] = shift.studentName || directory[studentId] || studentId;
    }
  });
  return directory;
}

function buildSummariesForStudent(allShifts, studentId, studentDirectory) {
  const ranges = ["week", "month", "overall"];
  const summaries = {};

  ranges.forEach((rangeKey) => {
    const filtered = allShifts.filter((shift) => isLocalDateInRange(shift.localDate, getRangeBounds(rangeKey)));
    const metricsByStudent = buildMetricsByStudent(filtered, studentDirectory);
    summaries[rangeKey] = metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentDirectory[studentId]);
  });

  return summaries;
}

function getStudentTodayStatus(studentShifts) {
  const today = pacificToday();
  const todaysShift = studentShifts
    .filter((shift) => shift.localDate === today)
    .sort(sortShiftsDesc)[0];

  if (!todaysShift) {
    return {
      localDate: today,
      status: "NOT_STARTED",
      nextAction: "Check In",
      nextEligibleCheckoutAt: "",
      site: "",
      hoursToday: 0,
      pointsToday: 0,
      checkInUtc: "",
      checkOutUtc: "",
      shiftStatus: "NOT_STARTED"
    };
  }

  const rawStatus = String(todaysShift.status || "").toUpperCase();
  if (rawStatus === "OPEN") {
    const nextEligibleCheckoutAt = todaysShift.checkInUtc
      ? new Date(new Date(todaysShift.checkInUtc).getTime() + (60 * 60 * 1000)).toISOString()
      : "";

    return {
      localDate: today,
      status: "CHECKED_IN",
      nextAction: "Check Out",
      nextEligibleCheckoutAt,
      site: todaysShift.site || "",
      hoursToday: round(toNumber(todaysShift.hoursDecimal), 2),
      pointsToday: round(toNumber(todaysShift.totalPoints), 1),
      checkInUtc: todaysShift.checkInUtc || "",
      checkOutUtc: todaysShift.checkOutUtc || "",
      shiftStatus: todaysShift.status || "OPEN"
    };
  }

  if (COMPLETE_STATUSES.has(rawStatus)) {
    return {
      localDate: today,
      status: "COMPLETED",
      nextAction: "Done for today",
      nextEligibleCheckoutAt: "",
      site: todaysShift.site || "",
      hoursToday: round(toNumber(todaysShift.hoursDecimal), 2),
      pointsToday: round(toNumber(todaysShift.totalPoints), 1),
      checkInUtc: todaysShift.checkInUtc || "",
      checkOutUtc: todaysShift.checkOutUtc || "",
      shiftStatus: todaysShift.status || "COMPLETE"
    };
  }

  return {
    localDate: today,
    status: "EXCEPTION",
    nextAction: "Check In",
    nextEligibleCheckoutAt: "",
    site: todaysShift.site || "",
    hoursToday: round(toNumber(todaysShift.hoursDecimal), 2),
    pointsToday: round(toNumber(todaysShift.totalPoints), 1),
    checkInUtc: todaysShift.checkInUtc || "",
    checkOutUtc: todaysShift.checkOutUtc || "",
    shiftStatus: todaysShift.status || "EXCEPTION"
  };
}

function parseShiftRows(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildHeaderIndex(headers);

  return records.map((row) => ({
    shiftId: String(getCell(row, index, "shiftid", 0) || ""),
    localDate: String(getCell(row, index, "localdate", 1) || ""),
    studentId: normalizeStudentId(getCell(row, index, "studentid", 2)),
    studentName: String(getCell(row, index, "studentname", 3) || ""),
    site: String(getCell(row, index, "site", 4) || ""),
    checkInUtc: String(getCell(row, index, "checkinutc", 5) || ""),
    checkOutUtc: String(getCell(row, index, "checkoututc", 6) || ""),
    durationMinutes: toNumber(getCell(row, index, "durationminutes", 7)),
    hoursDecimal: toNumber(getCell(row, index, "hoursdecimal", 8)),
    checkInPoints: toNumber(getCell(row, index, "checkinpoints", 9)),
    checkOutPoints: toNumber(getCell(row, index, "checkoutpoints", 10)),
    totalPoints: toNumber(getCell(row, index, "totalpoints", 11)),
    status: String(getCell(row, index, "status", 12) || ""),
    source: String(getCell(row, index, "source", 13) || ""),
    notes: String(getCell(row, index, "notes", 14) || "")
  })).filter((row) => row.studentId && row.localDate);
}

function parseRosterRows(rows) {
  if (!rows.length) {
    return {};
  }

  const [headers, ...records] = rows;
  const index = buildHeaderIndex(headers);
  const roster = {};

  records.forEach((row) => {
    const studentId = normalizeStudentId(getCell(row, index, "studentid", 0));
    const studentName = String(getCell(row, index, "studentname", 1) || "").trim();
    const status = String(getCell(row, index, "status", 2) || "active").trim().toLowerCase();
    if (!studentId || !studentName || status === "inactive") {
      return;
    }
    roster[studentId] = studentName;
  });

  return roster;
}

function parseAuditRows(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildHeaderIndex(headers);
  return records.map((row) => {
    const timestampUtc = String(getCell(row, index, "timestamputc", 0) || "");
    const localDate = String(getCell(row, index, "localdate", 1) || "");
    return {
      timestampUtc,
      localDate: localDate || (timestampUtc ? new Date(timestampUtc).toISOString().slice(0, 10) : ""),
      actorType: String(getCell(row, index, "actortype", 2) || ""),
      studentId: normalizeStudentId(getCell(row, index, "studentid", 3)),
      action: String(getCell(row, index, "action", 4) || ""),
      outcomeCode: String(getCell(row, index, "outcomecode", 5) || ""),
      message: String(getCell(row, index, "message", 6) || "")
    };
  }).filter((row) => row.timestampUtc).sort((a, b) => {
    return (Date.parse(b.timestampUtc) || 0) - (Date.parse(a.timestampUtc) || 0);
  });
}

async function buildStudentDashboardFromSheet(studentId, range = "week", options = {}) {
  const normalizedStudentId = normalizeStudentId(studentId);
  const shiftRows = parseShiftRows(await fetchSheetCsv("Shifts", options));
  const studentDirectory = buildStudentDirectory(shiftRows);
  const studentShifts = shiftRows
    .filter((shift) => shift.studentId === normalizedStudentId)
    .sort(sortShiftsDesc);

  const studentName = studentDirectory[normalizedStudentId] || studentShifts[0]?.studentName || normalizedStudentId;
  const summaries = buildSummariesForStudent(shiftRows, normalizedStudentId, studentDirectory);
  const today = getStudentTodayStatus(studentShifts);

  return {
    student: {
      studentId: normalizedStudentId,
      studentName: studentName,
      name: studentName
    },
    currentRange: range,
    week: {
      totalPoints: summaries.week.points,
      hoursDecimal: summaries.week.hours
    },
    today,
    summaries,
    selected: summaries[range] || summaries.week,
    recentShifts: studentShifts.slice(0, 10),
    exceptions: studentShifts.filter((shift) => String(shift.status || "").toUpperCase() === "EXCEPTION").slice(0, 10),
    benchmark: {
      topPoints: summaries[range]?.topPoints || 0,
      topHours: summaries[range]?.topHours || 0,
      benchmarkLabel: `Top student in ${range}`
    }
  };
}

function localDateToUtcDate(localDate) {
  const [year, month, day] = String(localDate || "").split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function shortDateLabel(localDate) {
  const date = localDateToUtcDate(localDate);
  if (!date) {
    return String(localDate || "");
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function buildDateSpan(startDate, endDate) {
  const start = localDateToUtcDate(startDate);
  const end = localDateToUtcDate(endDate);
  if (!start || !end || start > end) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function resolveSeriesBounds(bounds, shifts) {
  const sortedDates = shifts
    .map((shift) => String(shift.localDate || ""))
    .filter(Boolean)
    .sort();
  const fallbackToday = pacificToday();
  return {
    start: bounds.start || sortedDates[0] || fallbackToday,
    end: bounds.end || sortedDates[sortedDates.length - 1] || fallbackToday
  };
}

function buildDailySeries(startDate, endDate, shifts, valueSelector) {
  const grouped = {};
  shifts.forEach((shift) => {
    const key = String(shift.localDate || "");
    if (!key) {
      return;
    }
    grouped[key] = round((grouped[key] || 0) + toNumber(valueSelector(shift)), 2);
  });

  return buildDateSpan(startDate, endDate).map((localDate) => ({
    date: localDate,
    label: shortDateLabel(localDate),
    value: round(toNumber(grouped[localDate] || 0), 2)
  }));
}

function summarizeRange(shifts, rankedList) {
  const activeStudents = new Set();
  let pointsTotal = 0;
  let hoursTotal = 0;
  let completedShifts = 0;
  let openShifts = 0;
  let exceptionCount = 0;

  shifts.forEach((shift) => {
    activeStudents.add(shift.studentId);
    pointsTotal += toNumber(shift.totalPoints);
    hoursTotal += toNumber(shift.hoursDecimal);
    const status = String(shift.status || "").toUpperCase();
    if (COMPLETE_STATUSES.has(status)) {
      completedShifts += 1;
    } else if (status === "OPEN") {
      openShifts += 1;
    } else if (status === "EXCEPTION") {
      exceptionCount += 1;
    }
  });

  const activeCount = activeStudents.size;
  return {
    activeStudents: activeCount,
    pointsTotal: round(pointsTotal, 1),
    hoursTotal: round(hoursTotal, 2),
    completedShifts,
    openShifts,
    exceptionCount,
    averagePoints: activeCount ? round(pointsTotal / activeCount, 1) : 0,
    averageHours: activeCount ? round(hoursTotal / activeCount, 2) : 0,
    topPoints: rankedList.length ? toNumber(rankedList[0].topPoints) : 0,
    topHours: rankedList.length ? toNumber(rankedList[0].topHours) : 0,
    topStudentName: rankedList.length ? rankedList[0].studentName : "No benchmark yet"
  };
}

function buildTodaySummary(shifts, site) {
  const today = pacificToday();
  const todayShifts = shifts.filter((shift) => {
    if (shift.localDate !== today) {
      return false;
    }
    if (!site || site === "all") {
      return true;
    }
    return String(shift.site || "") === site;
  });

  const activeStudents = new Set();
  let completedShifts = 0;
  let openShifts = 0;
  let exceptionCount = 0;

  todayShifts.forEach((shift) => {
    activeStudents.add(shift.studentId);
    const status = String(shift.status || "").toUpperCase();
    if (COMPLETE_STATUSES.has(status)) {
      completedShifts += 1;
    } else if (status === "OPEN") {
      openShifts += 1;
    } else if (status === "EXCEPTION") {
      exceptionCount += 1;
    }
  });

  return {
    localDate: today,
    activeStudents: activeStudents.size,
    completedShifts,
    openShifts,
    exceptionCount
  };
}

function buildTodayStudents(shifts, site) {
  const today = pacificToday();
  return shifts.filter((shift) => {
    if (shift.localDate !== today) {
      return false;
    }
    if (!site || site === "all") {
      return true;
    }
    return String(shift.site || "") === site;
  }).sort(sortShiftsDesc).map((shift) => {
    const status = String(shift.status || "NOT_STARTED").toUpperCase();
    const isActive = status === "OPEN";
    let durationMinutes = toNumber(shift.durationMinutes);
    if (isActive && shift.checkInUtc) {
      const checkInMs = Date.parse(shift.checkInUtc);
      if (Number.isFinite(checkInMs)) {
        durationMinutes = Math.max(0, Math.round((Date.now() - checkInMs) / 60000));
      }
    }
    return {
      studentId: shift.studentId,
      studentName: shift.studentName,
      status,
      isActive,
      checkInUtc: shift.checkInUtc || "",
      checkOutUtc: shift.checkOutUtc || "",
      site: shift.site || "",
      durationMinutes,
      hoursDecimal: round(durationMinutes / 60, 2),
      totalPoints: toNumber(shift.totalPoints)
    };
  });
}

function buildSiteBreakdown(shifts) {
  const map = {};
  shifts.forEach((shift) => {
    const site = String(shift.site || "Unknown");
    if (!map[site]) {
      map[site] = {
        site,
        points: 0,
        hours: 0,
        completedShifts: 0
      };
    }
    map[site].points += toNumber(shift.totalPoints);
    map[site].hours += toNumber(shift.hoursDecimal);
    if (COMPLETE_STATUSES.has(String(shift.status || "").toUpperCase())) {
      map[site].completedShifts += 1;
    }
  });

  return Object.values(map).map((row) => ({
    site: row.site,
    points: round(row.points, 1),
    hours: round(row.hours, 2),
    completedShifts: row.completedShifts
  })).sort((a, b) => b.points - a.points);
}

function buildExceptionBreakdown(shifts) {
  const buckets = {
    COMPLETE: 0,
    OPEN: 0,
    EXCEPTION: 0
  };
  shifts.forEach((shift) => {
    const status = String(shift.status || "").toUpperCase();
    if (COMPLETE_STATUSES.has(status)) {
      buckets.COMPLETE += 1;
    } else if (status === "OPEN") {
      buckets.OPEN += 1;
    } else {
      buckets.EXCEPTION += 1;
    }
  });
  return [
    { label: "Complete", value: buckets.COMPLETE },
    { label: "Open", value: buckets.OPEN },
    { label: "Exception", value: buckets.EXCEPTION }
  ];
}

function buildCohortHeatmapSeries(shifts) {
  const maxDate = pacificToday();
  const minDate = shiftLocalDateString(maxDate, -83);
  const grouped = {};

  shifts.forEach((shift) => {
    if (shift.localDate < minDate || shift.localDate > maxDate) {
      return;
    }
    if (!grouped[shift.localDate]) {
      grouped[shift.localDate] = {
        activeStudents: new Set(),
        points: 0,
        hours: 0
      };
    }
    grouped[shift.localDate].activeStudents.add(shift.studentId);
    grouped[shift.localDate].points += toNumber(shift.totalPoints);
    grouped[shift.localDate].hours += toNumber(shift.hoursDecimal);
  });

  const maxActive = Math.max(
    0,
    ...Object.values(grouped).map((row) => row.activeStudents.size)
  );

  return buildDateSpan(minDate, maxDate).map((localDate) => {
    const day = grouped[localDate];
    const activeStudents = day ? day.activeStudents.size : 0;
    const points = day ? day.points : 0;
    const hours = day ? day.hours : 0;
    return {
      date: localDate,
      label: localDate,
      activeStudents,
      points: round(points, 1),
      hours: round(hours, 2),
      intensity: maxActive > 0 ? round((activeStudents / maxActive) * 100, 1) : 0
    };
  });
}

function filterAuditByRange(auditRows, range) {
  const bounds = getRangeBounds(range);
  return auditRows.filter((row) => isLocalDateInRange(row.localDate, bounds));
}

function hasMetricActivity(metrics = {}) {
  return [
    metrics.points,
    metrics.totalPoints,
    metrics.hours,
    metrics.hoursDecimal,
    metrics.completedShifts,
    metrics.openShifts,
    metrics.exceptionCount,
    metrics.activityDays
  ].some((value) => toNumber(value) > 0);
}

function hasSummaryActivity(summary = {}) {
  return [
    summary.pointsTotal,
    summary.hoursTotal,
    summary.completedShifts,
    summary.openShifts,
    summary.exceptionCount,
    summary.activeStudents
  ].some((value) => toNumber(value) > 0);
}

function hasAnyDashboardActivity(payload = {}) {
  if (hasSummaryActivity(payload.selected || {})) {
    return true;
  }

  const students = Array.isArray(payload.students) ? payload.students : [];
  if (students.some((row) => ["week", "month", "overall", "selectedRange"].some((key) => hasMetricActivity(row?.[key] || {})))) {
    return true;
  }

  if ((payload.recentShifts || []).length > 0 || (payload.exceptions || []).length > 0) {
    return true;
  }

  if ((payload.leaderboard || []).some((entry) => toNumber(entry.points) > 0 || toNumber(entry.hours) > 0)) {
    return true;
  }

  return false;
}

async function probeShiftSourceQuality(options = {}) {
  try {
    const shiftCsv = await fetchSheetCsv("Shifts", options);
    const shifts = parseShiftRows(shiftCsv);
    const hasRows = shifts.length > 0;
    const hasActivity = shifts.some((row) => (
      toNumber(row.totalPoints) > 0 ||
      toNumber(row.hoursDecimal) > 0 ||
      Boolean(String(row.status || "").trim())
    ));
    return {
      ok: true,
      rowCount: shifts.length,
      hasRows,
      hasActivity
    };
  } catch (error) {
    return {
      ok: false,
      rowCount: 0,
      hasRows: false,
      hasActivity: false
    };
  }
}

function withAdminDiagnostics(data, meta) {
  const diagnostics = meta?.diagnostics || {};
  return {
    ...(data || {}),
    source: meta?.source || "backend",
    dataQuality: meta?.dataQuality || "ok",
    diagnostics
  };
}

async function reconcileAdminPayloadQuality(serverData, range, site, options = {}) {
  if (hasAnyDashboardActivity(serverData)) {
    const meta = {
      source: "backend",
      dataQuality: "ok",
      fallbackUsed: false,
      diagnostics: {}
    };
    return {
      data: withAdminDiagnostics(serverData, meta),
      meta
    };
  }

  const sourceProbe = await probeShiftSourceQuality(options);
  if (!sourceProbe.ok || !sourceProbe.hasRows) {
    const meta = {
      source: "backend",
      dataQuality: "empty_dataset",
      fallbackUsed: false,
      diagnostics: {
        shiftRows: sourceProbe.rowCount,
        sourceProbeOk: sourceProbe.ok
      }
    };
    return {
      data: withAdminDiagnostics(serverData, meta),
      meta
    };
  }

  try {
    const fallbackData = await buildAdminDashboardFromSheet(range || "overall", site || "all", options);
    const fallbackHasActivity = hasAnyDashboardActivity(fallbackData);
    const meta = {
      source: "sheet_fallback",
      dataQuality: fallbackHasActivity ? "recovered_zeroed_backend" : "fallback_zero_activity",
      fallbackUsed: true,
      diagnostics: {
        shiftRows: sourceProbe.rowCount
      }
    };
    return {
      data: withAdminDiagnostics(fallbackData, meta),
      meta
    };
  } catch (fallbackError) {
    const meta = {
      source: "backend",
      dataQuality: "suspect_zeroed_backend",
      fallbackUsed: false,
      diagnostics: {
        shiftRows: sourceProbe.rowCount,
        fallbackError: String(fallbackError?.message || fallbackError || "")
      }
    };
    return {
      data: withAdminDiagnostics(serverData, meta),
      meta
    };
  }
}

async function buildAdminDashboardFromSheet(range = "overall", site = "all", options = {}) {
  const [shiftCsv, rosterCsv, auditCsv] = await Promise.all([
    fetchSheetCsv("Shifts", options),
    fetchSheetCsv("Roster", options).catch(() => []),
    fetchSheetCsv("Audit", options).catch(() => [])
  ]);

  const shiftRows = parseShiftRows(shiftCsv);
  const roster = parseRosterRows(rosterCsv);
  const auditTrail = parseAuditRows(auditCsv);
  const studentDirectory = buildStudentDirectory(shiftRows, roster);
  const knownSites = Array.from(new Set(shiftRows.map((row) => String(row.site || "")).filter(Boolean))).sort();

  const rangeData = {};
  ["week", "month", "overall"].forEach((rangeKey) => {
    const bounds = getRangeBounds(rangeKey);
    const filteredShifts = shiftRows.filter((shift) => {
      if (!isLocalDateInRange(shift.localDate, bounds)) {
        return false;
      }
      if (!site || site === "all") {
        return true;
      }
      return String(shift.site || "") === site;
    });

    const metricsByStudent = buildMetricsByStudent(filteredShifts, studentDirectory);
    const rankedList = Object.values(metricsByStudent).sort((a, b) => (a.rank || 0) - (b.rank || 0));

    rangeData[rangeKey] = {
      filteredShifts,
      metricsByStudent,
      rankedList,
      summary: summarizeRange(filteredShifts, rankedList)
    };
  });

  const selectedRange = rangeData[range] || rangeData.overall;
  const selectedShifts = selectedRange.filteredShifts;
  const selectedBounds = resolveSeriesBounds(getRangeBounds(range), selectedShifts);

  const students = Object.keys(studentDirectory).map((studentId) => {
    const studentName = studentDirectory[studentId];
    return {
      studentId,
      studentName,
      week: rangeData.week.metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentName),
      month: rangeData.month.metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentName),
      overall: rangeData.overall.metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentName),
      selectedRange: selectedRange.metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentName)
    };
  }).sort((a, b) => a.studentName.localeCompare(b.studentName));

  const exceptions = selectedShifts
    .filter((shift) => {
      const status = String(shift.status || "").toUpperCase();
      return status === "OPEN" || status === "EXCEPTION";
    })
    .sort(sortShiftsDesc)
    .slice(0, 20)
    .map((shift) => ({
      studentId: shift.studentId,
      studentName: shift.studentName,
      localDate: shift.localDate,
      status: shift.status,
      site: shift.site,
      message: String(shift.status || "").toUpperCase() === "OPEN"
        ? "Checkout still missing."
        : (shift.notes || "Shift needs review."),
      lastActivityUtc: shift.checkOutUtc || shift.checkInUtc || ""
    }));

  const recentShifts = selectedShifts.slice().sort(sortShiftsDesc).slice(0, 12);

  return {
    currentRange: range,
    currentSite: site || "all",
    generatedAt: new Date().toISOString(),
    sites: ["all", ...knownSites],
    summaries: {
      week: rangeData.week.summary,
      month: rangeData.month.summary,
      overall: rangeData.overall.summary
    },
    today: buildTodaySummary(shiftRows, site),
    todayStudents: buildTodayStudents(shiftRows, site),
    selected: selectedRange.summary,
    leaderboard: selectedRange.rankedList,
    students,
    charts: {
      pointsTrend: buildDailySeries(selectedBounds.start, selectedBounds.end, selectedShifts, (shift) => shift.totalPoints),
      hoursTrend: buildDailySeries(selectedBounds.start, selectedBounds.end, selectedShifts, (shift) => shift.hoursDecimal),
      leaderboard: selectedRange.rankedList.slice(0, 10).map((row) => ({
        label: row.studentName,
        studentId: row.studentId,
        points: row.points,
        hours: row.hours,
        pointsPctOfTop: row.pointsPctOfTop,
        hoursPctOfTop: row.hoursPctOfTop
      })),
      scatter: selectedRange.rankedList.map((row) => ({
        label: row.studentName,
        studentId: row.studentId,
        x: row.hours,
        y: row.points
      })),
      siteBreakdown: buildSiteBreakdown(selectedShifts),
      exceptionBreakdown: buildExceptionBreakdown(selectedShifts),
      heatmap: buildCohortHeatmapSeries(
        !site || site === "all"
          ? shiftRows
          : shiftRows.filter((shift) => String(shift.site || "") === site)
      )
    },
    exceptions,
    auditTrail: filterAuditByRange(auditTrail, range).slice(0, 15),
    recentShifts,
    printable: {
      title: "Cohort Summary Report",
      subtitle: `${range} / ${site || "all"}`,
      generatedAt: new Date().toISOString()
    }
  };
}

export async function submitAttendance(payload) {
  return requestJson(API_ENDPOINTS.submit, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });
}

export async function adminAuth(password) {
  return requestJson(API_ENDPOINTS.adminAuth, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({ password })
  });
}

export async function fetchStudentDashboard(studentId, range = "week", options = {}) {
  try {
    const response = await requestJson(API_ENDPOINTS.studentDashboard(studentId, range), options);
    if (response?.data && isStudentDashboardPayloadUsable(response.data)) {
      return {
        ...response,
        data: normalizeStudentDashboardPayload(response.data, range),
        meta: {
          ...(response.meta || {}),
          source: response.meta?.source || "backend"
        }
      };
    }
    throw {
      ok: false,
      code: "UNUSABLE_RESPONSE",
      message: "Student dashboard response was incomplete."
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    throw error;
  }
}

export async function fetchAdminDashboard({ token, range, site }, options = {}) {
  const normalizedRange = range || "overall";
  const normalizedSite = site || "all";
  try {
    const response = await requestJson(API_ENDPOINTS.adminDashboard(token, normalizedRange, normalizedSite), options);
    if (response?.data) {
      return {
        ok: true,
        data: response.data,
        meta: {
          ...(response.meta || {}),
          source: response.meta?.source || "backend"
        }
      };
    }
    throw {
      ok: false,
      code: "UNUSABLE_RESPONSE",
      message: "Admin dashboard response was incomplete."
    };
  } catch (error) {
    if (error?.code === "AUTH_REQUIRED") {
      throw error;
    }
    throw error;
  }
}

export async function fetchStudentRecords({
  token,
  range = "overall",
  site = "all",
  startDate = "",
  endDate = "",
  query = "",
  locationMode = "all",
  page = 1,
  pageSize = 12
}, options = {}) {
  return requestJson(API_ENDPOINTS.studentRecords({
    token,
    range,
    site,
    startDate,
    endDate,
    query,
    locationMode,
    page,
    pageSize
  }), options);
}

export async function fetchReportData({ token, type, range, site, studentId, historyScope }) {
  return requestJson(API_ENDPOINTS.reportData({ token, type, range, site, studentId, historyScope }));
}

export async function fetchLogs(token) {
  return requestJson(API_ENDPOINTS.logs(token));
}

export async function fetchPoints(token) {
  return requestJson(API_ENDPOINTS.points(token));
}

export async function fetchRoster(options = {}) {
  try {
    return await requestJson(API_ENDPOINTS.getRoster(), options);
  } catch (error) {
    return {
      ok: true,
      data: { ...ROSTER_FALLBACK }
    };
  }
}
