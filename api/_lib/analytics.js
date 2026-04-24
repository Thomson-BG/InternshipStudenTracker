const { CONFIG, RANGE_KEYS, COMPLETE_STATUSES } = require("./config");
const {
  buildDateSpan,
  formatLocalDate,
  normalizeLocalDateCell,
  normalizeStudentId,
  rangeLabel,
  roundTo,
  shiftLocalDateString,
  shortDateLabel,
  siteLabel
} = require("./utils");

function getRangeBounds(range) {
  if (range === "overall") {
    return {
      start: "",
      end: formatLocalDate(new Date(), CONFIG.timezone)
    };
  }

  const today = formatLocalDate(new Date(), CONFIG.timezone);
  if (range === "month") {
    return {
      start: `${today.slice(0, 8)}01`,
      end: today
    };
  }

  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: CONFIG.timezone,
    weekday: "short"
  }).format(new Date());
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const weekday = weekdayMap[weekdayName] || 1;

  return {
    start: shiftLocalDateString(today, -(weekday - 1)),
    end: today
  };
}

function normalizeRange(range) {
  const normalized = String(range || "overall").toLowerCase().trim();
  if (!RANGE_KEYS.includes(normalized)) {
    throw new Error("Range must be week, month, or overall.");
  }
  return normalized;
}

function normalizeSite(site) {
  return String(site || "all").trim() || "all";
}

function isLocalDateInRange(localDate, bounds) {
  const canonicalDate = normalizeLocalDateCell(localDate, CONFIG.timezone);
  if (!canonicalDate) {
    return false;
  }

  const start = normalizeLocalDateCell(bounds && bounds.start, CONFIG.timezone) || "";
  const end = normalizeLocalDateCell(bounds && bounds.end, CONFIG.timezone) || "";
  if (!bounds) {
    return true;
  }
  if (start && canonicalDate < start) {
    return false;
  }
  if (end && canonicalDate > end) {
    return false;
  }
  return true;
}

function sortShiftsDesc(a, b) {
  const aStamp = a.checkOutUtc || a.checkInUtc || a.localDate;
  const bStamp = b.checkOutUtc || b.checkInUtc || b.localDate;
  if (aStamp === bStamp) {
    return a.localDate < b.localDate ? 1 : -1;
  }
  return aStamp < bStamp ? 1 : -1;
}

function filterShiftsByRange(shifts, range) {
  const bounds = getRangeBounds(range);
  return shifts.filter((shift) => isLocalDateInRange(shift.localDate, bounds));
}

function filterShiftsBySite(shifts, site) {
  if (!site || site === "all") {
    return shifts.slice();
  }
  return shifts.filter((shift) => shift.site === site);
}

function resolveSeriesBounds(bounds, shifts) {
  const end = bounds.end || formatLocalDate(new Date(), CONFIG.timezone);
  if (bounds.start) {
    return {
      start: bounds.start,
      end
    };
  }

  const ordered = shifts.slice().sort((a, b) => {
    if (a.localDate < b.localDate) {
      return -1;
    }
    if (a.localDate > b.localDate) {
      return 1;
    }
    return 0;
  });

  return {
    start: ordered.length ? ordered[0].localDate : end,
    end
  };
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

function aggregateMetricsByStudent(shifts, studentDirectory) {
  const metrics = {};
  Object.keys(studentDirectory).forEach((studentId) => {
    metrics[studentId] = emptyStudentMetrics(studentId, studentDirectory[studentId]);
  });

  shifts.forEach((shift) => {
    if (!metrics[shift.studentId]) {
      metrics[shift.studentId] = emptyStudentMetrics(shift.studentId, shift.studentName || shift.studentId);
    }

    const target = metrics[shift.studentId];
    target.points += Number(shift.totalPoints || 0);
    target.hours += Number(shift.hoursDecimal || 0);
    if (COMPLETE_STATUSES[shift.status]) {
      target.completedShifts += 1;
    }
    if (shift.status === "OPEN") {
      target.openShifts += 1;
    }
    if (shift.status === "EXCEPTION") {
      target.exceptionCount += 1;
    }
    target.activityDays += 1;

    const lastActivity = shift.checkOutUtc || shift.checkInUtc || "";
    if (lastActivity && (!target.lastActivityUtc || lastActivity > target.lastActivityUtc)) {
      target.lastActivityUtc = lastActivity;
      target.lastSite = shift.site || target.lastSite;
      target.shiftStatus = shift.status;
    }
  });

  return metrics;
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
    return a.studentName < b.studentName ? -1 : 1;
  });

  const topPoints = sorted.length ? Number(sorted[0].points || 0) : 0;
  const topHours = sorted.length ? Number(sorted[0].hours || 0) : 0;
  const count = sorted.length;

  sorted.forEach((row, index) => {
    row.rank = index + 1;
    row.studentCount = count;
    row.topPoints = topPoints;
    row.topHours = topHours;
    row.pointsPctOfTop = topPoints > 0 ? roundTo((row.points / topPoints) * 100, 1) : 0;
    row.hoursPctOfTop = topHours > 0 ? roundTo((row.hours / topHours) * 100, 1) : 0;
    row.gapToTopPoints = roundTo(Math.max(topPoints - row.points, 0), 1);
    row.gapToTopHours = roundTo(Math.max(topHours - row.hours, 0), 2);
    row.percentile = count <= 1 ? 100 : roundTo(((count - row.rank) / (count - 1)) * 100, 1);
    row.points = roundTo(row.points, 1);
    row.hours = roundTo(row.hours, 2);
  });

  return sorted;
}

function summarizeRange(shifts, rankedList) {
  const activeStudents = {};
  let pointsTotal = 0;
  let hoursTotal = 0;
  let completedShifts = 0;
  let openShifts = 0;
  let exceptionCount = 0;

  shifts.forEach((shift) => {
    activeStudents[shift.studentId] = true;
    pointsTotal += Number(shift.totalPoints || 0);
    hoursTotal += Number(shift.hoursDecimal || 0);
    if (COMPLETE_STATUSES[shift.status]) {
      completedShifts += 1;
    }
    if (shift.status === "OPEN") {
      openShifts += 1;
    }
    if (shift.status === "EXCEPTION") {
      exceptionCount += 1;
    }
  });

  const activeCount = Object.keys(activeStudents).length;
  const totalShifts = completedShifts + openShifts + exceptionCount;
  return {
    activeStudents: activeCount,
    pointsTotal: roundTo(pointsTotal, 1),
    hoursTotal: roundTo(hoursTotal, 2),
    completedShifts,
    openShifts,
    exceptionCount,
    attendanceRate: totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0,
    averagePoints: activeCount ? roundTo(pointsTotal / activeCount, 1) : 0,
    averageHours: activeCount ? roundTo(hoursTotal / activeCount, 2) : 0,
    topPoints: rankedList.length ? rankedList[0].topPoints : 0,
    topHours: rankedList.length ? rankedList[0].topHours : 0,
    topStudentName: rankedList.length ? rankedList[0].studentName : "No benchmark yet"
  };
}

function buildAnalyticsBundle(allShifts, studentDirectory, site) {
  const bySite = filterShiftsBySite(allShifts, site);
  const bundle = { ranges: {} };

  RANGE_KEYS.forEach((rangeKey) => {
    const rangeShifts = filterShiftsByRange(bySite, rangeKey);
    const metricsByStudent = aggregateMetricsByStudent(rangeShifts, studentDirectory);
    const rankedList = rankMetrics(Object.keys(metricsByStudent).map((studentId) => metricsByStudent[studentId]));

    const metricsLookup = {};
    rankedList.forEach((row) => {
      metricsLookup[row.studentId] = row;
    });

    bundle.ranges[rangeKey] = {
      filteredShifts: rangeShifts,
      rankedList,
      metricsByStudent: metricsLookup,
      summary: summarizeRange(rangeShifts, rankedList)
    };
  });

  return bundle;
}

function getStudentTodayStatus(studentShifts) {
  const today = formatLocalDate(new Date(), CONFIG.timezone);
  const todaysShift = studentShifts.filter((shift) => shift.localDate === today).sort(sortShiftsDesc)[0];

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

  let status = "EXCEPTION";
  let nextAction = "Check In";
  let nextEligibleCheckoutAt = "";

  if (todaysShift.status === "OPEN") {
    status = "CHECKED_IN";
    nextAction = "Check Out";
    if (todaysShift.checkInUtc) {
      const nextDate = new Date(new Date(todaysShift.checkInUtc).getTime() + CONFIG.minMinutesBetweenInOut * 60 * 1000);
      nextEligibleCheckoutAt = nextDate.toISOString();
    }
  } else if (COMPLETE_STATUSES[todaysShift.status]) {
    status = "COMPLETED";
    nextAction = "Done for today";
  }

  return {
    localDate: today,
    status,
    nextAction,
    nextEligibleCheckoutAt,
    site: todaysShift.site || "",
    hoursToday: roundTo(Number(todaysShift.hoursDecimal || 0), 2),
    pointsToday: roundTo(Number(todaysShift.totalPoints || 0), 1),
    checkInUtc: todaysShift.checkInUtc || "",
    checkOutUtc: todaysShift.checkOutUtc || "",
    shiftStatus: todaysShift.status
  };
}

function buildDailySeries(startDate, endDate, shifts, valueSelector) {
  const map = {};
  shifts.forEach((shift) => {
    map[shift.localDate] = roundTo((map[shift.localDate] || 0) + Number(valueSelector(shift) || 0), 2);
  });

  return buildDateSpan(startDate, endDate).map((localDate) => ({
    date: localDate,
    label: shortDateLabel(localDate),
    value: roundTo(Number(map[localDate] || 0), 2)
  }));
}

function buildCumulativeSeries(startDate, endDate, shifts) {
  const grouped = {};
  shifts.forEach((shift) => {
    if (!grouped[shift.localDate]) {
      grouped[shift.localDate] = { points: 0, hours: 0 };
    }
    grouped[shift.localDate].points += Number(shift.totalPoints || 0);
    grouped[shift.localDate].hours += Number(shift.hoursDecimal || 0);
  });

  let runningPoints = 0;
  let runningHours = 0;
  return buildDateSpan(startDate, endDate).map((localDate) => {
    const day = grouped[localDate] || { points: 0, hours: 0 };
    runningPoints += day.points;
    runningHours += day.hours;
    return {
      date: localDate,
      label: shortDateLabel(localDate),
      points: roundTo(runningPoints, 1),
      hours: roundTo(runningHours, 2)
    };
  });
}

function buildHeatmapSeries(studentShifts) {
  const maxDate = formatLocalDate(new Date(), CONFIG.timezone);
  const minDate = shiftLocalDateString(maxDate, -83);
  const filtered = studentShifts.filter((shift) => shift.localDate >= minDate && shift.localDate <= maxDate);
  const grouped = {};

  filtered.forEach((shift) => {
    if (!grouped[shift.localDate]) {
      grouped[shift.localDate] = { points: 0, hours: 0, status: shift.status };
    }
    grouped[shift.localDate].points += Number(shift.totalPoints || 0);
    grouped[shift.localDate].hours += Number(shift.hoursDecimal || 0);
    grouped[shift.localDate].status = shift.status;
  });

  const maxPoints = Math.max(...filtered.map((shift) => Number(shift.totalPoints || 0)), 0);

  return buildDateSpan(minDate, maxDate).map((localDate) => {
    const value = grouped[localDate] || { points: 0, hours: 0, status: "NONE" };
    return {
      date: localDate,
      label: localDate,
      points: roundTo(value.points, 1),
      hours: roundTo(value.hours, 2),
      status: value.status,
      intensity: maxPoints > 0 ? roundTo((value.points / maxPoints) * 100, 1) : 0
    };
  });
}

function buildStudentCharts(studentShifts, range) {
  const weekRange = getRangeBounds("week");
  const selectedRangeBounds = getRangeBounds(range);
  const weekShifts = studentShifts.filter((shift) => isLocalDateInRange(shift.localDate, weekRange));
  const selectedShifts = studentShifts.filter((shift) => isLocalDateInRange(shift.localDate, selectedRangeBounds));
  const selectedSeriesBounds = resolveSeriesBounds(selectedRangeBounds, selectedShifts);

  return {
    weeklyPoints: buildDailySeries(weekRange.start, weekRange.end, weekShifts, (shift) => Number(shift.totalPoints || 0)),
    weeklyHours: buildDailySeries(weekRange.start, weekRange.end, weekShifts, (shift) => Number(shift.hoursDecimal || 0)),
    cumulative: buildCumulativeSeries(selectedSeriesBounds.start, selectedSeriesBounds.end, selectedShifts),
    heatmap: buildHeatmapSeries(studentShifts)
  };
}

function buildCohortHeatmapSeries(shifts) {
  const maxDate = formatLocalDate(new Date(), CONFIG.timezone);
  const minDate = shiftLocalDateString(maxDate, -83);
  const grouped = {};

  shifts.forEach((shift) => {
    if (shift.localDate < minDate || shift.localDate > maxDate) {
      return;
    }
    if (!grouped[shift.localDate]) {
      grouped[shift.localDate] = { activeStudents: {}, points: 0, hours: 0 };
    }
    grouped[shift.localDate].activeStudents[shift.studentId] = true;
    grouped[shift.localDate].points += Number(shift.totalPoints || 0);
    grouped[shift.localDate].hours += Number(shift.hoursDecimal || 0);
  });

  const activeCounts = Object.keys(grouped).map((localDate) => Object.keys(grouped[localDate].activeStudents).length);
  const maxActive = Math.max(...activeCounts, 0);

  return buildDateSpan(minDate, maxDate).map((localDate) => {
    const day = grouped[localDate] || { activeStudents: {}, points: 0, hours: 0 };
    const activeCount = Object.keys(day.activeStudents).length;
    return {
      date: localDate,
      label: localDate,
      activeStudents: activeCount,
      points: roundTo(day.points, 1),
      hours: roundTo(day.hours, 2),
      intensity: maxActive > 0 ? roundTo((activeCount / maxActive) * 100, 1) : 0
    };
  });
}

function buildSiteBreakdown(shifts) {
  const siteMap = {};
  shifts.forEach((shift) => {
    const site = shift.site || "Unknown";
    if (!siteMap[site]) {
      siteMap[site] = {
        site,
        points: 0,
        hours: 0,
        completedShifts: 0
      };
    }
    siteMap[site].points += Number(shift.totalPoints || 0);
    siteMap[site].hours += Number(shift.hoursDecimal || 0);
    if (COMPLETE_STATUSES[shift.status]) {
      siteMap[site].completedShifts += 1;
    }
  });

  return Object.keys(siteMap).map((site) => ({
    site,
    points: roundTo(siteMap[site].points, 1),
    hours: roundTo(siteMap[site].hours, 2),
    completedShifts: siteMap[site].completedShifts
  })).sort((a, b) => b.points - a.points);
}

function buildExceptionBreakdown(shifts) {
  const buckets = {
    COMPLETE: 0,
    OPEN: 0,
    EXCEPTION: 0
  };

  shifts.forEach((shift) => {
    if (COMPLETE_STATUSES[shift.status]) {
      buckets.COMPLETE += 1;
    } else if (shift.status === "OPEN") {
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

function buildStudentExceptions(studentShifts) {
  return studentShifts
    .filter((shift) => shift.status === "EXCEPTION" || shift.status === "OPEN")
    .sort(sortShiftsDesc)
    .slice(0, 10)
    .map((shift) => ({
      localDate: shift.localDate,
      status: shift.status,
      site: shift.site,
      message: shift.status === "OPEN" ? "Check-out still missing for this day." : (shift.notes || "Shift needs review."),
      checkInUtc: shift.checkInUtc,
      checkOutUtc: shift.checkOutUtc
    }));
}

function buildAdminExceptions(shifts) {
  return shifts
    .filter((shift) => shift.status === "EXCEPTION" || shift.status === "OPEN")
    .sort(sortShiftsDesc)
    .slice(0, 20)
    .map((shift) => ({
      studentId: shift.studentId,
      studentName: shift.studentName,
      localDate: shift.localDate,
      status: shift.status,
      site: shift.site,
      message: shift.status === "OPEN" ? "Checkout still missing." : (shift.notes || "Shift needs review."),
      lastActivityUtc: shift.checkOutUtc || shift.checkInUtc || ""
    }));
}

function buildAdminStudentRows(analytics) {
  const ids = Object.keys(analytics.ranges.overall.metricsByStudent);
  return ids.map((studentId) => ({
    studentId,
    studentName: analytics.ranges.overall.metricsByStudent[studentId].studentName,
    week: analytics.ranges.week.metricsByStudent[studentId],
    month: analytics.ranges.month.metricsByStudent[studentId],
    overall: analytics.ranges.overall.metricsByStudent[studentId],
    selectedRange: analytics.ranges.overall.metricsByStudent[studentId]
  })).sort((a, b) => (a.studentName < b.studentName ? -1 : 1));
}

function buildTodaySummary(allShifts, site) {
  const today = formatLocalDate(new Date(), CONFIG.timezone);
  const todaysShifts = filterShiftsBySite(allShifts, site).filter((shift) => shift.localDate === today);

  const activeStudents = {};
  const checkedInNow = {};
  let completedShifts = 0;
  let openShifts = 0;
  let exceptions = 0;
  todaysShifts.forEach((shift) => {
    activeStudents[shift.studentId] = true;
    if (COMPLETE_STATUSES[shift.status]) {
      completedShifts += 1;
    } else if (shift.status === "OPEN") {
      openShifts += 1;
      checkedInNow[shift.studentId] = true;
    } else if (shift.status === "EXCEPTION") {
      exceptions += 1;
    }
  });

  return {
    localDate: today,
    activeStudents: Object.keys(activeStudents).length,
    checkedInNow: Object.keys(checkedInNow).length,
    completedShifts,
    openShifts,
    exceptionCount: exceptions
  };
}

function buildTodayStudentRows(allShifts, site) {
  const today = formatLocalDate(new Date(), CONFIG.timezone);
  return filterShiftsBySite(allShifts, site)
    .filter((shift) => shift.localDate === today)
    .sort(sortShiftsDesc)
    .map((shift) => {
      const status = shift.status || "NOT_STARTED";
      const isActive = status === "OPEN";
      let durationMinutes = Number(shift.durationMinutes || 0);
      if (isActive && shift.checkInUtc) {
        const checkInMs = new Date(shift.checkInUtc).getTime();
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
        hoursDecimal: roundTo(durationMinutes / 60, 2),
        totalPoints: Number(shift.totalPoints || 0)
      };
    });
}

function filterAuditTrailForRange(audits, range) {
  const bounds = getRangeBounds(range);
  return (audits || [])
    .filter((entry) => isLocalDateInRange(entry.localDate, bounds))
    .sort((a, b) => new Date(b.timestampUtc).getTime() - new Date(a.timestampUtc).getTime());
}

function buildAdminCharts(shifts, rankedList, range, site) {
  const rangeBounds = getRangeBounds(range);
  const seriesBounds = resolveSeriesBounds(rangeBounds, shifts);
  return {
    pointsTrend: buildDailySeries(seriesBounds.start, seriesBounds.end, shifts, (shift) => Number(shift.totalPoints || 0)),
    hoursTrend: buildDailySeries(seriesBounds.start, seriesBounds.end, shifts, (shift) => Number(shift.hoursDecimal || 0)),
    leaderboard: rankedList.slice(0, 10).map((row) => ({
      label: row.studentName,
      studentId: row.studentId,
      points: row.points,
      hours: row.hours,
      pointsPctOfTop: row.pointsPctOfTop,
      hoursPctOfTop: row.hoursPctOfTop
    })),
    scatter: rankedList.map((row) => ({
      label: row.studentName,
      studentId: row.studentId,
      x: row.hours,
      y: row.points
    })),
    siteBreakdown: buildSiteBreakdown(shifts),
    exceptionBreakdown: buildExceptionBreakdown(shifts),
    heatmap: buildCohortHeatmapSeries(filterShiftsBySite(shifts, site === "all" ? null : site))
  };
}

function buildStudentDirectory({ logs = [], points = [], shifts = [], roster = {} }) {
  const directory = {};

  Object.keys(roster || {}).forEach((studentId) => {
    directory[studentId] = roster[studentId];
  });

  logs.forEach((row) => {
    if (row.studentId) {
      directory[row.studentId] = row.studentName || directory[row.studentId] || row.studentId;
    }
  });

  points.forEach((row) => {
    if (row.studentId) {
      directory[row.studentId] = row.studentName || directory[row.studentId] || row.studentId;
    }
  });

  shifts.forEach((row) => {
    if (row.studentId) {
      directory[row.studentId] = row.studentName || directory[row.studentId] || row.studentId;
    }
  });

  return directory;
}

function getAllSites({ shifts = [], logs = [] }) {
  const sites = {};
  shifts.forEach((shift) => {
    if (shift.site) {
      sites[shift.site] = true;
    }
  });
  logs.forEach((log) => {
    if (log.site) {
      sites[log.site] = true;
    }
  });
  return Object.keys(sites).sort();
}

function parsePageValue(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
}

function parsePageSizeValue(value, fallback = 12) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(50, Math.max(5, Math.floor(parsed)));
}

function normalizeRecordsLocationMode(mode) {
  const normalized = String(mode || "all").trim().toLowerCase();
  const allowed = {
    all: true,
    has_checkin: true,
    has_checkout: true,
    has_both: true,
    missing_any: true
  };
  return allowed[normalized] ? normalized : "all";
}

function getStudentDashboardPayload(state, studentId, range) {
  const normalizedStudentId = normalizeStudentId(studentId);
  const studentDirectory = state.studentDirectory || {};

  if (!studentDirectory[normalizedStudentId]) {
    throw new Error("Student ID is not recognized.");
  }

  const analytics = buildAnalyticsBundle(state.shifts, studentDirectory, null);
  const summaries = {};
  RANGE_KEYS.forEach((rangeKey) => {
    summaries[rangeKey] = analytics.ranges[rangeKey].metricsByStudent[normalizedStudentId]
      || emptyStudentMetrics(normalizedStudentId, studentDirectory[normalizedStudentId]);
  });

  const selectedSummary = summaries[range];
  const studentShifts = state.shifts.filter((shift) => shift.studentId === normalizedStudentId);
  const shiftHistory = studentShifts.slice().sort(sortShiftsDesc);
  const today = getStudentTodayStatus(studentShifts);

  return {
    student: {
      studentId: normalizedStudentId,
      studentName: studentDirectory[normalizedStudentId],
      name: studentDirectory[normalizedStudentId]
    },
    currentRange: range,
    week: {
      totalPoints: roundTo(Number((summaries.week && summaries.week.points) || 0), 1),
      hoursDecimal: roundTo(Number((summaries.week && summaries.week.hours) || 0), 2)
    },
    today,
    summaries,
    selected: selectedSummary,
    charts: buildStudentCharts(studentShifts, range),
    recentShifts: shiftHistory.slice(0, 10),
    shiftHistory,
    exceptions: buildStudentExceptions(studentShifts),
    benchmark: {
      topPoints: selectedSummary.topPoints,
      topHours: selectedSummary.topHours,
      benchmarkLabel: `Top student in ${rangeLabel(range)}`
    }
  };
}

function buildSiteKPIsForToday(allShifts, siteNames) {
  const today = formatLocalDate(new Date(), CONFIG.timezone);
  const todaysShifts = allShifts.filter((s) => s.localDate === today);

  return siteNames.map((site) => {
    const siteShifts = todaysShifts.filter((s) => s.site === site);
    const checkedInNow = new Set();
    const completedToday = new Set();
    const activeToday = new Set();

    siteShifts.forEach((shift) => {
      activeToday.add(shift.studentId);
      if (shift.status === "OPEN") {
        checkedInNow.add(shift.studentId);
      }
      if (COMPLETE_STATUSES[shift.status]) {
        completedToday.add(shift.studentId);
      }
    });

    return {
      site,
      checkedInNow: checkedInNow.size,
      completedToday: completedToday.size,
      activeToday: activeToday.size
    };
  }).filter((s) => s.activeToday > 0);
}

function getAdminDashboardPayload(state, range, site) {
  const analytics = buildAnalyticsBundle(state.shifts, state.studentDirectory, site);
  const selectedRange = analytics.ranges[range];
  const filteredShifts = selectedRange.filteredShifts;
  const todaySummary = buildTodaySummary(state.shifts, site);
  const todayStudents = buildTodayStudentRows(state.shifts, site);

  const overallRanked = analytics.ranges.overall.rankedList;
  const topByHours = overallRanked.slice().sort((a, b) => b.hours - a.hours)[0] || null;
  const overallStats = {
    topPointsStudent: overallRanked.length ? { name: overallRanked[0].studentName, points: overallRanked[0].points } : null,
    topHoursStudent: topByHours ? { name: topByHours.studentName, hours: topByHours.hours } : null
  };

  return {
    currentRange: range,
    currentSite: site,
    generatedAt: new Date().toISOString(),
    sites: ["all", ...state.sites],
    summaries: {
      week: analytics.ranges.week.summary,
      month: analytics.ranges.month.summary,
      overall: analytics.ranges.overall.summary
    },
    today: todaySummary,
    todayStudents,
    selected: selectedRange.summary,
    leaderboard: selectedRange.rankedList,
    students: buildAdminStudentRows(analytics),
    charts: buildAdminCharts(filteredShifts, selectedRange.rankedList, range, site),
    exceptions: buildAdminExceptions(filteredShifts),
    auditTrail: filterAuditTrailForRange(state.audits, range).slice(0, 15),
    recentShifts: filteredShifts.slice().sort(sortShiftsDesc).slice(0, 12),
    overallStats,
    siteKPIs: buildSiteKPIsForToday(state.shifts, state.sites),
    printable: {
      title: "Cohort Summary Report",
      subtitle: `${rangeLabel(range)} / ${siteLabel(site)}`,
      generatedAt: new Date().toISOString()
    }
  };
}

function buildStudentRecordsPayload(state, options = {}) {
  const range = normalizeRange(options.range || "overall");
  const site = normalizeSite(options.site || "all");
  const startDateRaw = normalizeLocalDateCell(options.startDate, CONFIG.timezone);
  const endDateRaw = normalizeLocalDateCell(options.endDate, CONFIG.timezone);
  const query = String(options.query || "").trim();
  const queryNeedle = query.toLowerCase();
  const locationMode = normalizeRecordsLocationMode(options.locationMode);
  const page = parsePageValue(options.page, 1);
  const pageSize = parsePageSizeValue(options.pageSize, 12);

  const usingCustomDateRange = Boolean(startDateRaw || endDateRaw);
  const bounds = usingCustomDateRange
    ? {
      start: startDateRaw || "",
      end: endDateRaw || formatLocalDate(new Date(), CONFIG.timezone)
    }
    : getRangeBounds(range);

  if (bounds.start && bounds.end && bounds.start > bounds.end) {
    const originalStart = bounds.start;
    bounds.start = bounds.end;
    bounds.end = originalStart;
  }

  const filteredShifts = filterShiftsBySite(state.shifts, site)
    .filter((shift) => isLocalDateInRange(shift.localDate, bounds))
    .sort(sortShiftsDesc);

  const actionLogsByDay = new Map();
  const actionLogsByTimestamp = new Map();

  (state.logs || []).forEach((log) => {
    const action = String(log.action || "");
    if (action !== "Check In" && action !== "Check Out") {
      return;
    }

    const dayActionKey = `${log.studentId}|${log.localDate}|${action}`;
    if (!actionLogsByDay.has(dayActionKey)) {
      actionLogsByDay.set(dayActionKey, []);
    }
    actionLogsByDay.get(dayActionKey).push(log);

    if (log.timestampUtc) {
      const timestampKey = `${dayActionKey}|${log.timestampUtc}`;
      actionLogsByTimestamp.set(timestampKey, log);
    }
  });

  actionLogsByDay.forEach((items) => {
    items.sort((a, b) => new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime());
  });

  function resolveLogForShift(shift, action, timestampUtc) {
    const dayActionKey = `${shift.studentId}|${shift.localDate}|${action}`;
    if (timestampUtc) {
      const timestampKey = `${dayActionKey}|${timestampUtc}`;
      if (actionLogsByTimestamp.has(timestampKey)) {
        return actionLogsByTimestamp.get(timestampKey);
      }
    }
    const bucket = actionLogsByDay.get(dayActionKey);
    return bucket && bucket.length ? bucket[0] : null;
  }

  const rows = filteredShifts.map((shift) => {
    const checkInLog = resolveLogForShift(shift, "Check In", shift.checkInUtc);
    const checkOutLog = resolveLogForShift(shift, "Check Out", shift.checkOutUtc);
    return {
      shiftId: shift.shiftId,
      localDate: shift.localDate,
      studentId: shift.studentId,
      studentName: shift.studentName,
      site: shift.site || "",
      status: shift.status || "",
      checkInUtc: shift.checkInUtc || "",
      checkOutUtc: shift.checkOutUtc || "",
      checkInLat: checkInLog ? checkInLog.lat : "",
      checkInLng: checkInLog ? checkInLog.lng : "",
      checkOutLat: checkOutLog ? checkOutLog.lat : "",
      checkOutLng: checkOutLog ? checkOutLog.lng : "",
      durationMinutes: Number(shift.durationMinutes || 0),
      hoursDecimal: Number(shift.hoursDecimal || 0)
    };
  });

  const hasCoordinates = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const locationFilteredRows = rows.filter((row) => {
    const hasCheckIn = hasCoordinates(row.checkInLat, row.checkInLng);
    const hasCheckOut = hasCoordinates(row.checkOutLat, row.checkOutLng);
    if (locationMode === "has_checkin") {
      return hasCheckIn;
    }
    if (locationMode === "has_checkout") {
      return hasCheckOut;
    }
    if (locationMode === "has_both") {
      return hasCheckIn && hasCheckOut;
    }
    if (locationMode === "missing_any") {
      return !hasCheckIn || !hasCheckOut;
    }
    return true;
  });

  const queryFilteredRows = queryNeedle
    ? locationFilteredRows.filter((row) => {
      const haystack = `${row.studentName || ""} ${row.studentId || ""}`.toLowerCase();
      return haystack.includes(queryNeedle);
    })
    : locationFilteredRows;

  const totalRows = queryFilteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedRows = queryFilteredRows.slice(startIndex, startIndex + pageSize);

  const internNames = Object.keys(state.studentDirectory || {})
    .map((studentId) => String(state.studentDirectory[studentId] || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return {
    currentRange: range,
    currentSite: site,
    currentStartDate: usingCustomDateRange ? (bounds.start || "") : "",
    currentEndDate: usingCustomDateRange ? (bounds.end || "") : "",
    currentQuery: query,
    currentLocationMode: locationMode,
    generatedAt: new Date().toISOString(),
    totalRows,
    page: currentPage,
    pageSize,
    totalPages,
    rows: pagedRows,
    filterOptions: {
      sites: ["all", ...(state.sites || [])],
      interns: internNames
    }
  };
}

function getReportPayload(state, type, range, site, studentId) {
  if (type === "student") {
    if (!studentId) {
      throw new Error("Student report requires studentId.");
    }
    const studentPayload = getStudentDashboardPayload(state, studentId, range);
    return {
      type: "student",
      generatedAt: new Date().toISOString(),
      reportTitle: "Student Progress Report",
      reportSubtitle: `${studentPayload.student.studentName} / ${rangeLabel(range)}`,
      payload: studentPayload
    };
  }

  if (type === "cohort") {
    const adminPayload = getAdminDashboardPayload(state, range, site);
    return {
      type: "cohort",
      generatedAt: new Date().toISOString(),
      reportTitle: "Cohort Summary Report",
      reportSubtitle: `${rangeLabel(range)} / ${siteLabel(site)}`,
      payload: adminPayload
    };
  }

  throw new Error("Report type must be student or cohort.");
}

module.exports = {
  buildStudentRecordsPayload,
  buildStudentDirectory,
  filterShiftsBySite,
  getAdminDashboardPayload,
  getAllSites,
  getRangeBounds,
  getReportPayload,
  getStudentDashboardPayload,
  isLocalDateInRange,
  normalizeRange,
  normalizeSite,
  sortShiftsDesc,
  buildAnalyticsBundle,
  filterAuditTrailForRange
};
