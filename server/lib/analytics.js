const { CONFIG } = require("./config");
const {
  stringify,
  normalizeStudentId,
  toNumber,
  round,
  pacificToday,
  shiftLocalDateString,
  getRangeBounds,
  isLocalDateInRange,
  shortDateLabel,
  buildDateSpan
} = require("./utils");

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
    return String(a.studentName || "").localeCompare(String(b.studentName || ""));
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

function isCompleteStatus(status) {
  return CONFIG.completeStatuses.has(String(status || "").toUpperCase());
}

function buildMetricsByStudent(shifts, studentDirectory) {
  const metrics = {};
  Object.entries(studentDirectory || {}).forEach(([studentId, studentName]) => {
    metrics[studentId] = emptyStudentMetrics(studentId, studentName);
  });

  (shifts || []).forEach((shift) => {
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

    const status = String(shift.status || "").toUpperCase();
    if (isCompleteStatus(status)) {
      target.completedShifts += 1;
    }
    if (status === "OPEN") {
      target.openShifts += 1;
    }
    if (status === "EXCEPTION") {
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

function resolveSeriesBounds(bounds, shifts) {
  const sortedDates = (shifts || [])
    .map((shift) => stringify(shift.localDate))
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
  (shifts || []).forEach((shift) => {
    const key = stringify(shift.localDate);
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

function buildCumulativeSeries(startDate, endDate, shifts) {
  const grouped = {};
  (shifts || []).forEach((shift) => {
    if (!grouped[shift.localDate]) {
      grouped[shift.localDate] = { points: 0, hours: 0 };
    }
    grouped[shift.localDate].points += toNumber(shift.totalPoints);
    grouped[shift.localDate].hours += toNumber(shift.hoursDecimal);
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
      points: round(runningPoints, 1),
      hours: round(runningHours, 2)
    };
  });
}

function buildHeatmapSeries(studentShifts) {
  const maxDate = pacificToday();
  const minDate = shiftLocalDateString(maxDate, -83);

  const grouped = {};
  (studentShifts || []).forEach((shift) => {
    if (shift.localDate < minDate || shift.localDate > maxDate) {
      return;
    }

    if (!grouped[shift.localDate]) {
      grouped[shift.localDate] = { points: 0, hours: 0, status: "NONE" };
    }

    grouped[shift.localDate].points += toNumber(shift.totalPoints);
    grouped[shift.localDate].hours += toNumber(shift.hoursDecimal);
    grouped[shift.localDate].status = shift.status || grouped[shift.localDate].status;
  });

  const maxPoints = Math.max(
    0,
    ...(studentShifts || []).map((shift) => toNumber(shift.totalPoints))
  );

  return buildDateSpan(minDate, maxDate).map((localDate) => {
    const value = grouped[localDate] || { points: 0, hours: 0, status: "NONE" };
    return {
      date: localDate,
      label: localDate,
      points: round(value.points, 1),
      hours: round(value.hours, 2),
      status: value.status,
      intensity: maxPoints > 0 ? round((value.points / maxPoints) * 100, 1) : 0
    };
  });
}

function buildCohortHeatmapSeries(shifts) {
  const maxDate = pacificToday();
  const minDate = shiftLocalDateString(maxDate, -83);
  const grouped = {};

  (shifts || []).forEach((shift) => {
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

function summarizeRange(shifts, rankedList) {
  const activeStudents = new Set();
  let pointsTotal = 0;
  let hoursTotal = 0;
  let completedShifts = 0;
  let openShifts = 0;
  let exceptionCount = 0;

  (shifts || []).forEach((shift) => {
    activeStudents.add(shift.studentId);
    pointsTotal += toNumber(shift.totalPoints);
    hoursTotal += toNumber(shift.hoursDecimal);

    const status = String(shift.status || "").toUpperCase();
    if (isCompleteStatus(status)) {
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

function getStudentTodayStatus(studentShifts) {
  const today = pacificToday();
  const todaysShift = (studentShifts || [])
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

  const status = String(todaysShift.status || "").toUpperCase();
  if (status === "OPEN") {
    const nextEligibleCheckoutAt = todaysShift.checkInUtc
      ? new Date(new Date(todaysShift.checkInUtc).getTime() + (CONFIG.minMinutesBetweenInOut * 60 * 1000)).toISOString()
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

  if (isCompleteStatus(status)) {
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

function buildSummariesForStudent(allShifts, studentId, studentDirectory) {
  const summaries = {};
  ["week", "month", "overall"].forEach((rangeKey) => {
    const filtered = (allShifts || []).filter((shift) => isLocalDateInRange(shift.localDate, getRangeBounds(rangeKey)));
    const metricsByStudent = buildMetricsByStudent(filtered, studentDirectory);
    summaries[rangeKey] = metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentDirectory[studentId]);
  });
  return summaries;
}

function buildStudentCharts(studentShifts, range) {
  const weekBounds = getRangeBounds("week");
  const selectedBounds = getRangeBounds(range);

  const weekShifts = (studentShifts || []).filter((shift) => isLocalDateInRange(shift.localDate, weekBounds));
  const selectedShifts = (studentShifts || []).filter((shift) => isLocalDateInRange(shift.localDate, selectedBounds));
  const selectedSeriesBounds = resolveSeriesBounds(selectedBounds, selectedShifts);

  return {
    weeklyPoints: buildDailySeries(weekBounds.start, weekBounds.end, weekShifts, (shift) => shift.totalPoints),
    weeklyHours: buildDailySeries(weekBounds.start, weekBounds.end, weekShifts, (shift) => shift.hoursDecimal),
    cumulative: buildCumulativeSeries(selectedSeriesBounds.start, selectedSeriesBounds.end, selectedShifts),
    heatmap: buildHeatmapSeries(studentShifts)
  };
}

function buildTodaySummary(shifts, site) {
  const today = pacificToday();
  const todayShifts = (shifts || []).filter((shift) => {
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
    if (isCompleteStatus(status)) {
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

  return (shifts || []).filter((shift) => {
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

  (shifts || []).forEach((shift) => {
    const site = String(shift.site || "Unknown");
    if (!map[site]) {
      map[site] = { site, points: 0, hours: 0, completedShifts: 0 };
    }

    map[site].points += toNumber(shift.totalPoints);
    map[site].hours += toNumber(shift.hoursDecimal);

    if (isCompleteStatus(shift.status)) {
      map[site].completedShifts += 1;
    }
  });

  return Object.values(map)
    .map((row) => ({
      site: row.site,
      points: round(row.points, 1),
      hours: round(row.hours, 2),
      completedShifts: row.completedShifts
    }))
    .sort((a, b) => b.points - a.points);
}

function buildExceptionBreakdown(shifts) {
  const buckets = { COMPLETE: 0, OPEN: 0, EXCEPTION: 0 };

  (shifts || []).forEach((shift) => {
    const status = String(shift.status || "").toUpperCase();
    if (isCompleteStatus(status)) {
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

function filterAuditByRange(auditRows, range) {
  const bounds = getRangeBounds(range);
  return (auditRows || []).filter((row) => isLocalDateInRange(row.localDate, bounds));
}

function buildStudentDashboardPayload({ studentId, range = "week", shifts = [], studentDirectory = {} }) {
  const normalizedStudentId = normalizeStudentId(studentId);
  const studentName = studentDirectory[normalizedStudentId] || normalizedStudentId;

  const studentShifts = shifts
    .filter((shift) => normalizeStudentId(shift.studentId) === normalizedStudentId)
    .sort(sortShiftsDesc);

  const summaries = buildSummariesForStudent(shifts, normalizedStudentId, studentDirectory);
  const today = getStudentTodayStatus(studentShifts);

  return {
    student: {
      studentId: normalizedStudentId,
      studentName,
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
    charts: buildStudentCharts(studentShifts, range),
    recentShifts: studentShifts.slice(0, 10),
    exceptions: studentShifts.filter((shift) => String(shift.status || "").toUpperCase() === "EXCEPTION").slice(0, 10),
    benchmark: {
      topPoints: summaries[range]?.topPoints || 0,
      topHours: summaries[range]?.topHours || 0,
      benchmarkLabel: `Top student in ${range}`
    }
  };
}

function buildAdminDashboardPayload({ range = "overall", site = "all", shifts = [], studentDirectory = {}, auditTrail = [] }) {
  const knownSites = Array.from(new Set(shifts.map((row) => String(row.site || "")).filter(Boolean))).sort();
  const rangeData = {};

  ["week", "month", "overall"].forEach((rangeKey) => {
    const bounds = getRangeBounds(rangeKey);
    const filteredShifts = shifts.filter((shift) => {
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

  const students = Object.keys(studentDirectory).map((studentId) => ({
    studentId,
    studentName: studentDirectory[studentId],
    week: rangeData.week.metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentDirectory[studentId]),
    month: rangeData.month.metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentDirectory[studentId]),
    overall: rangeData.overall.metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentDirectory[studentId]),
    selectedRange: selectedRange.metricsByStudent[studentId] || emptyStudentMetrics(studentId, studentDirectory[studentId])
  })).sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)));

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
    today: buildTodaySummary(shifts, site),
    todayStudents: buildTodayStudents(shifts, site),
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
          ? shifts
          : shifts.filter((shift) => String(shift.site || "") === site)
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

function buildReportPayload({ type, range = "overall", site = "all", studentId = "", shifts = [], studentDirectory = {}, auditTrail = [] }) {
  if (type === "student") {
    const payload = buildStudentDashboardPayload({
      studentId,
      range,
      shifts,
      studentDirectory
    });

    return {
      type: "student",
      generatedAt: new Date().toISOString(),
      reportTitle: "Student Progress Report",
      reportSubtitle: `${payload.student.studentName} / ${range}`,
      payload
    };
  }

  const payload = buildAdminDashboardPayload({
    range,
    site,
    shifts,
    studentDirectory,
    auditTrail
  });

  return {
    type: "cohort",
    generatedAt: new Date().toISOString(),
    reportTitle: "Cohort Summary Report",
    reportSubtitle: `${range} / ${site}`,
    payload
  };
}

module.exports = {
  buildStudentDashboardPayload,
  buildAdminDashboardPayload,
  buildReportPayload
};
