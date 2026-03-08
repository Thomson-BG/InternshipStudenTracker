const CONFIG = {
  spreadsheetId: "1Dd4qJ3SkARcigi-kmM9wCUc9NkRqpQoEkFVri7_FKlY",
  timezone: "America/Los_Angeles",
  goLiveDate: "2026-02-24",
  pointsPerAction: 10,
  minMinutesBetweenInOut: 60,
  adminSessionHours: 8,
  cacheTtlSeconds: 60,
  logsSheetName: "Logs",
  shiftsSheetName: "Shifts",
  pointsSheetName: "Points",
  auditSheetName: "Audit",
  adminPasswordHash: "79f0da1b920dade97eb4e9e02df79a606c265d69349a600a65c0d4e289feaa44"
};

const LEGACY_LOG_HEADERS = [
  "timestampUtc",
  "studentId",
  "studentName",
  "action",
  "site",
  "lat",
  "lng",
  "localDate",
  "metadata"
];

const LOG_HEADERS = LEGACY_LOG_HEADERS.concat(["eventId", "source"]);

const SHIFT_HEADERS = [
  "shiftId",
  "localDate",
  "studentId",
  "studentName",
  "site",
  "checkInUtc",
  "checkOutUtc",
  "durationMinutes",
  "hoursDecimal",
  "checkInPoints",
  "checkOutPoints",
  "totalPoints",
  "status",
  "source",
  "notes"
];

const POINT_HEADERS = [
  "studentId",
  "studentName",
  "baselinePoints",
  "earnedPoints",
  "totalPoints",
  "lastUpdated"
];

const AUDIT_HEADERS = [
  "timestampUtc",
  "localDate",
  "actorType",
  "studentId",
  "action",
  "outcomeCode",
  "message",
  "site",
  "lat",
  "lng",
  "metadata"
];

const ACTIVE_STUDENTS = {
  "131923": "Jordan Belvin",
  "168115": "Jonah Chavez",
  "131523": "Adrian Delgado Hernandez",
  "160601": "Lenore Ditmore",
  "132819": "Scarlet Grady",
  "126607": "Adrian Herrera",
  "132120": "Ethan Little",
  "131352": "Diego Ochoa",
  "159660": "Azriel Perez",
  "133569": "Porter Preston",
  "160166": "Maximus Robles",
  "131356": "Adrian Rodriguez Valdes",
  "155404": "Carlos Salgado",
  "132483": "James Windham",
  "125814": "Zacharias Bramhall",
  "010101": "Mr. Thomson"
};

const RESPONSE_CODES = {
  recorded: "RECORDED",
  invalidPayload: "INVALID_PAYLOAD",
  invalidAction: "INVALID_ACTION",
  invalidMode: "INVALID_MODE",
  invalidRange: "INVALID_RANGE",
  missingField: "MISSING_FIELD",
  unknownStudent: "UNKNOWN_STUDENT",
  alreadyCheckedIn: "ALREADY_CHECKED_IN",
  alreadyCheckedOut: "ALREADY_CHECKED_OUT",
  checkinRequired: "CHECKIN_REQUIRED",
  cooldownNotMet: "COOLDOWN_NOT_MET",
  authRequired: "AUTH_REQUIRED",
  invalidCredentials: "INVALID_CREDENTIALS",
  serverError: "SERVER_ERROR"
};

const RANGE_KEYS = ["week", "month", "overall"];
const COMPLETE_STATUSES = {
  COMPLETE: true,
  BACKFILLED_COMPLETE: true
};

function doGet(e) {
  try {
    const mode = normalizeMode_(e && e.parameter && e.parameter.mode);
    const context = ensureSchema_();
    const tokenModes = {
      admin_dashboard: true,
      report_data: true,
      logs: true,
      points: true
    };

    if (tokenModes[mode]) {
      const authError = requireAdminToken_(e);
      if (authError) {
        return authError;
      }
    }

    if (mode === "logs") {
      const derivedState = ensureDerivedSheetsFresh_(context);
      return jsonResponse_({ ok: true, data: derivedState.logs });
    }

    if (mode === "points") {
      const derivedState = ensureDerivedSheetsFresh_(context);
      return jsonResponse_({ ok: true, data: derivedState.points });
    }

    if (mode === "student_dashboard") {
      const studentId = stringify_(e && e.parameter && e.parameter.studentId);
      const range = normalizeRange_(e && e.parameter && e.parameter.range);
      if (!studentId) {
        return errorResponse_(RESPONSE_CODES.missingField, "Missing required field: studentId");
      }

      const derivedState = ensureDerivedSheetsFresh_(context);
      const dashboard = getStudentDashboardPayload_(derivedState, studentId, range);
      return jsonResponse_({ ok: true, data: dashboard });
    }

    if (mode === "admin_dashboard") {
      const range = normalizeRange_(e && e.parameter && e.parameter.range);
      const site = normalizeSite_(e && e.parameter && e.parameter.site);
      const derivedState = ensureDerivedSheetsFresh_(context);
      const payload = getCachedPayload_("admin_dashboard", [range, site], function () {
        return getAdminDashboardPayload_(derivedState, range, site);
      });
      return jsonResponse_({ ok: true, data: payload });
    }

    if (mode === "report_data") {
      const type = stringify_(e && e.parameter && e.parameter.type).toLowerCase();
      const range = normalizeRange_(e && e.parameter && e.parameter.range);
      const site = normalizeSite_(e && e.parameter && e.parameter.site);
      const studentId = stringify_(e && e.parameter && e.parameter.studentId);
      const derivedState = ensureDerivedSheetsFresh_(context);
      const payload = getCachedPayload_("report_data", [type, range, site, studentId], function () {
        return getReportPayload_(derivedState, type, range, site, studentId);
      });
      return jsonResponse_({ ok: true, data: payload });
    }

    return errorResponse_(RESPONSE_CODES.invalidMode, "Unsupported mode: " + mode);
  } catch (err) {
    return errorResponse_(RESPONSE_CODES.serverError, err.message);
  }
}

function doPost(e) {
  const mode = normalizeMode_(e && e.parameter && e.parameter.mode);
  if (mode === "admin_auth") {
    return handleAdminAuth_(e);
  }
  return handleAttendancePost_(e);
}

function handleAdminAuth_(e) {
  const context = ensureSchema_();
  cleanupExpiredSessions_();

  try {
    const payload = parsePayload_(e);
    const password = stringify_(payload.password);
    if (!password) {
      appendAudit_(context.auditSheet, {
        actorType: "ADMIN",
        studentId: "",
        action: "LOGIN",
        outcomeCode: RESPONSE_CODES.missingField,
        message: "Missing required field: password",
        site: "",
        lat: "",
        lng: "",
        metadata: { source: "admin_auth" }
      });
      return errorResponse_(RESPONSE_CODES.missingField, "Missing required field: password");
    }

    const expectedHash = getAdminPasswordHash_();
    const providedHash = sha256Hex_(password);
    if (providedHash !== expectedHash) {
      appendAudit_(context.auditSheet, {
        actorType: "ADMIN",
        studentId: "",
        action: "LOGIN",
        outcomeCode: RESPONSE_CODES.invalidCredentials,
        message: "Invalid admin password.",
        site: "",
        lat: "",
        lng: "",
        metadata: { source: "admin_auth" }
      });
      return errorResponse_(RESPONSE_CODES.invalidCredentials, "Incorrect password.");
    }

    const session = createAdminSession_();
    appendAudit_(context.auditSheet, {
      actorType: "ADMIN",
      studentId: "",
      action: "LOGIN",
      outcomeCode: RESPONSE_CODES.recorded,
      message: "Admin login succeeded.",
      site: "",
      lat: "",
      lng: "",
      metadata: { source: "admin_auth", expiresAt: session.expiresAt }
    });

    return jsonResponse_({
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt
    });
  } catch (err) {
    appendAudit_(context.auditSheet, {
      actorType: "ADMIN",
      studentId: "",
      action: "LOGIN",
      outcomeCode: RESPONSE_CODES.serverError,
      message: err.message,
      site: "",
      lat: "",
      lng: "",
      metadata: { source: "admin_auth" }
    });
    return errorResponse_(RESPONSE_CODES.serverError, err.message);
  }
}

function handleAttendancePost_(e) {
  const lock = LockService.getScriptLock();
  let hasLock = false;
  let context = null;

  try {
    lock.waitLock(20000);
    hasLock = true;
    context = ensureSchema_();

    const payload = parsePayload_(e);
    const validationError = validateAttendancePayload_(payload);
    if (validationError) {
      appendAudit_(context.auditSheet, buildStudentAuditFromPayload_(payload, validationError.code, validationError.message));
      return errorResponse_(validationError.code, validationError.message, validationError.extra);
    }

    const studentId = stringify_(payload.studentId);
    const studentName = ACTIVE_STUDENTS[studentId] || stringify_(payload.studentName);
    if (!ACTIVE_STUDENTS[studentId]) {
      const unknownError = {
        code: RESPONSE_CODES.unknownStudent,
        message: "Student ID is not recognized."
      };
      appendAudit_(context.auditSheet, buildStudentAuditFromPayload_(payload, unknownError.code, unknownError.message));
      return errorResponse_(unknownError.code, unknownError.message);
    }

    const action = stringify_(payload.action);
    const now = new Date();
    const localDate = formatLocalDate_(now);
    const logs = listLogRecords_(context.logsSheet);
    const todaysEvents = logs.filter(function (row) {
      return row.studentId === studentId && row.localDate === localDate;
    });
    const checkInEvents = todaysEvents.filter(function (row) {
      return row.action === "Check In";
    });
    const checkOutEvents = todaysEvents.filter(function (row) {
      return row.action === "Check Out";
    });

    if (action === "Check In" && checkInEvents.length > 0) {
      appendAudit_(context.auditSheet, buildStudentAuditFromPayload_(payload, RESPONSE_CODES.alreadyCheckedIn, "You already checked in today."));
      return errorResponse_(RESPONSE_CODES.alreadyCheckedIn, "You already checked in today.");
    }

    if (action === "Check Out") {
      if (checkOutEvents.length > 0) {
        appendAudit_(context.auditSheet, buildStudentAuditFromPayload_(payload, RESPONSE_CODES.alreadyCheckedOut, "You already checked out today."));
        return errorResponse_(RESPONSE_CODES.alreadyCheckedOut, "You already checked out today.");
      }

      if (checkInEvents.length === 0) {
        appendAudit_(context.auditSheet, buildStudentAuditFromPayload_(payload, RESPONSE_CODES.checkinRequired, "You must check in first before checking out."));
        return errorResponse_(RESPONSE_CODES.checkinRequired, "You must check in first before checking out.");
      }

      const checkInTime = checkInEvents[0].timestamp;
      const elapsedMs = now.getTime() - checkInTime.getTime();
      const minMs = CONFIG.minMinutesBetweenInOut * 60 * 1000;
      if (elapsedMs < minMs) {
        const retryAfterMinutes = Math.ceil((minMs - elapsedMs) / (60 * 1000));
        appendAudit_(context.auditSheet, buildStudentAuditFromPayload_(payload, RESPONSE_CODES.cooldownNotMet, "You must wait at least 60 minutes between check-in and check-out.", { retryAfterMinutes: retryAfterMinutes }));
        return errorResponse_(
          RESPONSE_CODES.cooldownNotMet,
          "You must wait at least 60 minutes between check-in and check-out.",
          { retryAfterMinutes: retryAfterMinutes }
        );
      }
    }

    const eventId = Utilities.getUuid();
    const source = "web";
    const metadata = {
      clientTimestamp: stringify_(payload.clientTimestamp),
      userAgent: stringify_(payload.userAgent),
      source: source
    };

    context.logsSheet.appendRow([
      now.toISOString(),
      studentId,
      studentName,
      action,
      stringify_(payload.site),
      coerceNumber_(payload.lat),
      coerceNumber_(payload.lng),
      localDate,
      JSON.stringify(metadata),
      eventId,
      source
    ]);

    const derivedState = ensureDerivedSheetsFresh_(context, { force: true });
    const pointsRow = findPointRow_(derivedState.points, studentId);
    const pointsDelta = localDate >= CONFIG.goLiveDate ? CONFIG.pointsPerAction : 0;

    return jsonResponse_({
      ok: true,
      code: RESPONSE_CODES.recorded,
      pointsDelta: pointsDelta,
      totalPoints: pointsRow ? pointsRow.totalPoints : pointsDelta,
      localDate: localDate,
      action: action
    });
  } catch (err) {
    if (context) {
      appendAudit_(context.auditSheet, {
        actorType: "STUDENT",
        studentId: "",
        action: "ATTENDANCE_SUBMIT",
        outcomeCode: RESPONSE_CODES.serverError,
        message: err.message,
        site: "",
        lat: "",
        lng: "",
        metadata: { source: "attendance" }
      });
    }
    return errorResponse_(RESPONSE_CODES.serverError, err.message);
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

function ensureSchema_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const logsSheet = ensureLogsSheet_(spreadsheet);
  const shiftsSheet = ensureSheetWithHeaders_(spreadsheet, CONFIG.shiftsSheetName, SHIFT_HEADERS);
  const pointsSheet = ensureSheetWithHeaders_(spreadsheet, CONFIG.pointsSheetName, POINT_HEADERS);
  const auditSheet = ensureSheetWithHeaders_(spreadsheet, CONFIG.auditSheetName, AUDIT_HEADERS);

  return {
    spreadsheet: spreadsheet,
    logsSheet: logsSheet,
    shiftsSheet: shiftsSheet,
    pointsSheet: pointsSheet,
    auditSheet: auditSheet
  };
}

function ensureLogsSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.logsSheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.logsSheetName);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
    return sheet;
  }

  const maxHeaderCols = Math.max(sheet.getLastColumn(), LOG_HEADERS.length, LEGACY_LOG_HEADERS.length);
  if (maxHeaderCols === 0) {
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
    return sheet;
  }

  const headerRow = sheet.getRange(1, 1, 1, maxHeaderCols).getValues()[0];
  const legacyMatch = LEGACY_LOG_HEADERS.every(function (header, index) {
    return normalizeHeaderCell_(headerRow[index]) === header;
  });
  const currentMatch = LOG_HEADERS.every(function (header, index) {
    return normalizeHeaderCell_(headerRow[index]) === header;
  });

  if (!legacyMatch && !currentMatch) {
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
    return sheet;
  }

  if (!currentMatch) {
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
  }

  return sheet;
}

function ensureSheetWithHeaders_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const maxHeaderCols = Math.max(sheet.getLastColumn(), headers.length);
  if (maxHeaderCols === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  const currentHeader = sheet.getRange(1, 1, 1, maxHeaderCols).getValues()[0];
  const hasExpectedHeader = headers.every(function (header, index) {
    return normalizeHeaderCell_(currentHeader[index]) === header;
  });

  if (!hasExpectedHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function ensureDerivedSheetsFresh_(context, options) {
  const baselines = getBaselineMap_(context.pointsSheet);
  const fingerprint = computeDerivedFingerprint_(context.logsSheet, baselines);
  const scriptProperties = PropertiesService.getScriptProperties();
  const priorFingerprint = scriptProperties.getProperty("DERIVED_FINGERPRINT") || "";
  const shouldRebuild = Boolean(options && options.force) || fingerprint !== priorFingerprint;

  if (shouldRebuild) {
    const logs = listLogRecords_(context.logsSheet);
    const audits = listAuditRecords_(context.auditSheet);
    const derivedState = buildDerivedState_(logs, audits, baselines);
    writeSheetRows_(context.shiftsSheet, SHIFT_HEADERS, derivedState.shiftRows);
    writeSheetRows_(context.pointsSheet, POINT_HEADERS, derivedState.pointRows);
    scriptProperties.setProperty("DERIVED_FINGERPRINT", fingerprint);
    scriptProperties.setProperty("DATA_VERSION", String(new Date().getTime()));
    return buildMaterializedState_(context, derivedState, logs, audits);
  }

  return buildMaterializedState_(context, null, null, null);
}

function buildMaterializedState_(context, derivedState, providedLogs, providedAudits) {
  const logs = providedLogs || listLogRecords_(context.logsSheet);
  const audits = providedAudits || listAuditRecords_(context.auditSheet);
  const shifts = derivedState ? derivedState.shifts : listShiftRecords_(context.shiftsSheet);
  const points = derivedState ? derivedState.points : listPointRecords_(context.pointsSheet);
  const studentDirectory = buildStudentDirectory_(logs, points);

  return {
    logs: logs,
    audits: audits,
    shifts: shifts,
    points: points,
    studentDirectory: studentDirectory,
    sites: getAllSites_(shifts, logs)
  };
}

function buildDerivedState_(logs, audits, baselineMap) {
  const grouped = {};
  logs.forEach(function (event) {
    const key = event.studentId + "::" + event.localDate;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(event);
  });

  const shiftRecords = [];
  Object.keys(grouped).sort().forEach(function (key) {
    const shift = deriveShiftForDay_(grouped[key]);
    if (shift) {
      shiftRecords.push(shift);
    }
  });

  shiftRecords.sort(function (a, b) {
    if (a.localDate !== b.localDate) {
      return a.localDate < b.localDate ? 1 : -1;
    }
    if (a.studentName !== b.studentName) {
      return a.studentName < b.studentName ? -1 : 1;
    }
    return 0;
  });

  const studentDirectory = buildStudentDirectory_(logs, null);
  const pointRecords = buildPointRecords_(shiftRecords, baselineMap, studentDirectory);

  return {
    shifts: shiftRecords,
    shiftRows: shiftRecords.map(serializeShiftRow_),
    points: pointRecords,
    pointRows: pointRecords.map(serializePointRow_),
    audits: audits || [],
    studentDirectory: studentDirectory
  };
}

function deriveShiftForDay_(events) {
  if (!events || !events.length) {
    return null;
  }

  const sorted = events.slice().sort(function (a, b) {
    return a.timestamp.getTime() - b.timestamp.getTime();
  });

  const first = sorted[0];
  const checkIns = sorted.filter(function (row) {
    return row.action === "Check In";
  });
  const checkOuts = sorted.filter(function (row) {
    return row.action === "Check Out";
  });
  const firstCheckIn = checkIns.length ? checkIns[0] : null;
  const minMs = CONFIG.minMinutesBetweenInOut * 60 * 1000;
  let validCheckOut = null;
  let hasEarlyCheckout = false;

  if (firstCheckIn) {
    for (let i = 0; i < checkOuts.length; i += 1) {
      const candidate = checkOuts[i];
      if (candidate.timestamp.getTime() - firstCheckIn.timestamp.getTime() >= minMs) {
        validCheckOut = candidate;
        break;
      }
      hasEarlyCheckout = true;
    }
  }

  const notes = [];
  if (checkIns.length > 1) {
    notes.push("DUPLICATE_CHECK_IN");
  }
  if (checkOuts.length > 1) {
    notes.push("DUPLICATE_CHECK_OUT");
  }
  if (hasEarlyCheckout && !validCheckOut) {
    notes.push("COOLDOWN_NOT_MET");
  }
  if (!firstCheckIn && checkOuts.length) {
    notes.push("CHECKOUT_WITHOUT_CHECKIN");
  }

  const localDate = first.localDate;
  const studentId = first.studentId;
  const studentName = first.studentName || ACTIVE_STUDENTS[studentId] || studentId;
  const site = firstCheckIn ? firstCheckIn.site : first.site;
  const eligibleForPoints = localDate >= CONFIG.goLiveDate;

  let status = "EXCEPTION";
  let checkInUtc = "";
  let checkOutUtc = "";
  let durationMinutes = 0;
  let hoursDecimal = 0;
  let checkInPoints = 0;
  let checkOutPoints = 0;
  let source = eligibleForPoints ? "live" : "backfill";

  if (firstCheckIn) {
    checkInUtc = firstCheckIn.timestampUtc;
    if (eligibleForPoints) {
      checkInPoints = CONFIG.pointsPerAction;
    }
  }

  if (firstCheckIn && validCheckOut) {
    checkOutUtc = validCheckOut.timestampUtc;
    durationMinutes = Math.max(0, Math.round((validCheckOut.timestamp.getTime() - firstCheckIn.timestamp.getTime()) / 60000));
    hoursDecimal = roundTo_(durationMinutes / 60, 2);
    if (eligibleForPoints) {
      checkOutPoints = CONFIG.pointsPerAction;
    }
    status = eligibleForPoints ? "COMPLETE" : "BACKFILLED_COMPLETE";
  } else if (firstCheckIn && checkOuts.length === 0) {
    status = "OPEN";
  } else if (firstCheckIn && !validCheckOut) {
    status = "EXCEPTION";
  } else if (!firstCheckIn && checkOuts.length) {
    status = "EXCEPTION";
  }

  return {
    shiftId: studentId + "-" + localDate,
    localDate: localDate,
    studentId: studentId,
    studentName: studentName,
    site: site,
    checkInUtc: checkInUtc,
    checkOutUtc: checkOutUtc,
    durationMinutes: durationMinutes,
    hoursDecimal: hoursDecimal,
    checkInPoints: checkInPoints,
    checkOutPoints: checkOutPoints,
    totalPoints: checkInPoints + checkOutPoints,
    status: status,
    source: source,
    notes: notes.join(", ")
  };
}

function buildPointRecords_(shifts, baselineMap, studentDirectory) {
  const aggregate = {};
  Object.keys(studentDirectory).forEach(function (studentId) {
    aggregate[studentId] = {
      studentId: studentId,
      studentName: studentDirectory[studentId],
      baselinePoints: Number(baselineMap[studentId] || 0),
      earnedPoints: 0,
      totalPoints: Number(baselineMap[studentId] || 0),
      lastUpdated: ""
    };
  });

  shifts.forEach(function (shift) {
    if (!aggregate[shift.studentId]) {
      aggregate[shift.studentId] = {
        studentId: shift.studentId,
        studentName: shift.studentName || shift.studentId,
        baselinePoints: Number(baselineMap[shift.studentId] || 0),
        earnedPoints: 0,
        totalPoints: Number(baselineMap[shift.studentId] || 0),
        lastUpdated: ""
      };
    }

    const target = aggregate[shift.studentId];
    target.earnedPoints += Number(shift.totalPoints || 0);
    target.totalPoints = roundTo_(target.baselinePoints + target.earnedPoints, 2);
    const latestTimestamp = shift.checkOutUtc || shift.checkInUtc || "";
    if (latestTimestamp && (!target.lastUpdated || latestTimestamp > target.lastUpdated)) {
      target.lastUpdated = latestTimestamp;
    }
  });

  return Object.keys(aggregate).map(function (studentId) {
    return aggregate[studentId];
  }).sort(function (a, b) {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.studentName < b.studentName ? -1 : 1;
  });
}

function getStudentDashboardPayload_(derivedState, studentId, range) {
  const studentDirectory = derivedState.studentDirectory;
  if (!studentDirectory[studentId]) {
    throw new Error("Student ID is not recognized.");
  }

  const analytics = buildAnalyticsBundle_(derivedState.shifts, studentDirectory, null);
  const summaries = {};
  RANGE_KEYS.forEach(function (rangeKey) {
    summaries[rangeKey] = analytics.ranges[rangeKey].metricsByStudent[studentId] || emptyStudentMetrics_(studentId, studentDirectory[studentId]);
  });

  const selectedSummary = summaries[range];
  const studentShifts = derivedState.shifts.filter(function (shift) {
    return shift.studentId === studentId;
  });
  const today = getStudentTodayStatus_(studentShifts);

  return {
    student: {
      studentId: studentId,
      studentName: studentDirectory[studentId]
    },
    currentRange: range,
    today: today,
    summaries: summaries,
    selected: selectedSummary,
    charts: buildStudentCharts_(studentShifts, range),
    recentShifts: studentShifts.slice().sort(sortShiftsDesc_).slice(0, 10),
    exceptions: buildStudentExceptions_(studentShifts),
    benchmark: {
      topPoints: selectedSummary.topPoints,
      topHours: selectedSummary.topHours,
      benchmarkLabel: "Top student in " + rangeLabel_(range)
    }
  };
}

function getAdminDashboardPayload_(derivedState, range, site) {
  const analytics = buildAnalyticsBundle_(derivedState.shifts, derivedState.studentDirectory, site);
  const selectedRange = analytics.ranges[range];
  const filteredShifts = selectedRange.filteredShifts;
  const todaySummary = buildTodaySummary_(derivedState.shifts, site);

  return {
    currentRange: range,
    currentSite: site,
    generatedAt: new Date().toISOString(),
    sites: ["all"].concat(derivedState.sites),
    summaries: {
      week: analytics.ranges.week.summary,
      month: analytics.ranges.month.summary,
      overall: analytics.ranges.overall.summary
    },
    today: todaySummary,
    selected: selectedRange.summary,
    leaderboard: selectedRange.rankedList,
    students: buildAdminStudentRows_(analytics),
    charts: buildAdminCharts_(filteredShifts, selectedRange.rankedList, range, site),
    exceptions: buildAdminExceptions_(filteredShifts),
    auditTrail: filterAuditTrailForRange_(derivedState.audits, range).slice(0, 15),
    recentShifts: filteredShifts.slice().sort(sortShiftsDesc_).slice(0, 12),
    printable: {
      title: "Cohort Summary Report",
      subtitle: rangeLabel_(range) + " / " + siteLabel_(site),
      generatedAt: new Date().toISOString()
    }
  };
}

function getReportPayload_(derivedState, type, range, site, studentId) {
  if (type === "student") {
    if (!studentId) {
      throw new Error("Student report requires studentId.");
    }
    const studentPayload = getStudentDashboardPayload_(derivedState, studentId, range);
    return {
      type: "student",
      generatedAt: new Date().toISOString(),
      reportTitle: "Student Progress Report",
      reportSubtitle: studentPayload.student.studentName + " / " + rangeLabel_(range),
      payload: studentPayload
    };
  }

  if (type === "cohort") {
    const adminPayload = getAdminDashboardPayload_(derivedState, range, site);
    return {
      type: "cohort",
      generatedAt: new Date().toISOString(),
      reportTitle: "Cohort Summary Report",
      reportSubtitle: rangeLabel_(range) + " / " + siteLabel_(site),
      payload: adminPayload
    };
  }

  throw new Error("Report type must be student or cohort.");
}

function buildAnalyticsBundle_(allShifts, studentDirectory, site) {
  const bySite = filterShiftsBySite_(allShifts, site);
  const bundle = { ranges: {} };

  RANGE_KEYS.forEach(function (rangeKey) {
    const rangeShifts = filterShiftsByRange_(bySite, rangeKey);
    const metricsByStudent = aggregateMetricsByStudent_(rangeShifts, studentDirectory);
    const rankedList = rankMetrics_(Object.keys(metricsByStudent).map(function (studentId) {
      return metricsByStudent[studentId];
    }));

    const metricsLookup = {};
    rankedList.forEach(function (row) {
      metricsLookup[row.studentId] = row;
    });

    bundle.ranges[rangeKey] = {
      filteredShifts: rangeShifts,
      rankedList: rankedList,
      metricsByStudent: metricsLookup,
      summary: summarizeRange_(rangeShifts, rankedList)
    };
  });

  return bundle;
}

function aggregateMetricsByStudent_(shifts, studentDirectory) {
  const metrics = {};
  Object.keys(studentDirectory).forEach(function (studentId) {
    metrics[studentId] = emptyStudentMetrics_(studentId, studentDirectory[studentId]);
  });

  shifts.forEach(function (shift) {
    if (!metrics[shift.studentId]) {
      metrics[shift.studentId] = emptyStudentMetrics_(shift.studentId, shift.studentName || shift.studentId);
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

function emptyStudentMetrics_(studentId, studentName) {
  return {
    studentId: studentId,
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

function rankMetrics_(rows) {
  const sorted = rows.slice().sort(function (a, b) {
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

  sorted.forEach(function (row, index) {
    row.rank = index + 1;
    row.studentCount = count;
    row.topPoints = topPoints;
    row.topHours = topHours;
    row.pointsPctOfTop = topPoints > 0 ? roundTo_((row.points / topPoints) * 100, 1) : 0;
    row.hoursPctOfTop = topHours > 0 ? roundTo_((row.hours / topHours) * 100, 1) : 0;
    row.gapToTopPoints = roundTo_(Math.max(topPoints - row.points, 0), 1);
    row.gapToTopHours = roundTo_(Math.max(topHours - row.hours, 0), 2);
    if (count <= 1) {
      row.percentile = 100;
    } else {
      row.percentile = roundTo_(((count - row.rank) / (count - 1)) * 100, 1);
    }
    row.points = roundTo_(row.points, 1);
    row.hours = roundTo_(row.hours, 2);
  });

  return sorted;
}

function summarizeRange_(shifts, rankedList) {
  const activeStudents = {};
  let pointsTotal = 0;
  let hoursTotal = 0;
  let completedShifts = 0;
  let openShifts = 0;
  let exceptionCount = 0;

  shifts.forEach(function (shift) {
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
  return {
    activeStudents: activeCount,
    pointsTotal: roundTo_(pointsTotal, 1),
    hoursTotal: roundTo_(hoursTotal, 2),
    completedShifts: completedShifts,
    openShifts: openShifts,
    exceptionCount: exceptionCount,
    averagePoints: activeCount ? roundTo_(pointsTotal / activeCount, 1) : 0,
    averageHours: activeCount ? roundTo_(hoursTotal / activeCount, 2) : 0,
    topPoints: rankedList.length ? rankedList[0].topPoints : 0,
    topHours: rankedList.length ? rankedList[0].topHours : 0,
    topStudentName: rankedList.length ? rankedList[0].studentName : "No benchmark yet"
  };
}

function getStudentTodayStatus_(studentShifts) {
  const today = formatLocalDate_(new Date());
  const todaysShift = studentShifts.filter(function (shift) {
    return shift.localDate === today;
  }).sort(sortShiftsDesc_)[0];

  if (!todaysShift) {
    return {
      localDate: today,
      status: "NOT_STARTED",
      nextAction: "Check In",
      nextEligibleCheckoutAt: "",
      site: "",
      hoursToday: 0,
      pointsToday: 0
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
    status: status,
    nextAction: nextAction,
    nextEligibleCheckoutAt: nextEligibleCheckoutAt,
    site: todaysShift.site || "",
    hoursToday: roundTo_(Number(todaysShift.hoursDecimal || 0), 2),
    pointsToday: roundTo_(Number(todaysShift.totalPoints || 0), 1),
    checkInUtc: todaysShift.checkInUtc || "",
    checkOutUtc: todaysShift.checkOutUtc || "",
    shiftStatus: todaysShift.status
  };
}

function buildStudentCharts_(studentShifts, range) {
  const weekRange = getRangeBounds_("week");
  const selectedRangeBounds = getRangeBounds_(range);
  const weekShifts = studentShifts.filter(function (shift) {
    return isLocalDateInRange_(shift.localDate, weekRange);
  });
  const selectedShifts = studentShifts.filter(function (shift) {
    return isLocalDateInRange_(shift.localDate, selectedRangeBounds);
  });
  const selectedSeriesBounds = resolveSeriesBounds_(selectedRangeBounds, selectedShifts);

  return {
    weeklyPoints: buildDailySeries_(weekRange.start, weekRange.end, weekShifts, function (shift) {
      return Number(shift.totalPoints || 0);
    }),
    weeklyHours: buildDailySeries_(weekRange.start, weekRange.end, weekShifts, function (shift) {
      return Number(shift.hoursDecimal || 0);
    }),
    cumulative: buildCumulativeSeries_(selectedSeriesBounds.start, selectedSeriesBounds.end, selectedShifts),
    heatmap: buildHeatmapSeries_(studentShifts)
  };
}

function buildAdminCharts_(shifts, rankedList, range, site) {
  const rangeBounds = getRangeBounds_(range);
  const seriesBounds = resolveSeriesBounds_(rangeBounds, shifts);
  return {
    pointsTrend: buildDailySeries_(seriesBounds.start, seriesBounds.end, shifts, function (shift) {
      return Number(shift.totalPoints || 0);
    }),
    hoursTrend: buildDailySeries_(seriesBounds.start, seriesBounds.end, shifts, function (shift) {
      return Number(shift.hoursDecimal || 0);
    }),
    leaderboard: rankedList.slice(0, 10).map(function (row) {
      return {
        label: row.studentName,
        studentId: row.studentId,
        points: row.points,
        hours: row.hours,
        pointsPctOfTop: row.pointsPctOfTop,
        hoursPctOfTop: row.hoursPctOfTop
      };
    }),
    scatter: rankedList.map(function (row) {
      return {
        label: row.studentName,
        studentId: row.studentId,
        x: row.hours,
        y: row.points
      };
    }),
    siteBreakdown: buildSiteBreakdown_(shifts),
    exceptionBreakdown: buildExceptionBreakdown_(shifts),
    heatmap: buildCohortHeatmapSeries_(filterShiftsBySite_(shifts, site === "all" ? null : site))
  };
}

function buildDailySeries_(startDate, endDate, shifts, valueSelector) {
  const map = {};
  shifts.forEach(function (shift) {
    map[shift.localDate] = roundTo_((map[shift.localDate] || 0) + Number(valueSelector(shift) || 0), 2);
  });

  const dates = buildDateSpan_(startDate, endDate);
  return dates.map(function (localDate) {
    return {
      date: localDate,
      label: shortDateLabel_(localDate),
      value: roundTo_(Number(map[localDate] || 0), 2)
    };
  });
}

function buildCumulativeSeries_(startDate, endDate, shifts) {
  const grouped = {};
  shifts.forEach(function (shift) {
    if (!grouped[shift.localDate]) {
      grouped[shift.localDate] = { points: 0, hours: 0 };
    }
    grouped[shift.localDate].points += Number(shift.totalPoints || 0);
    grouped[shift.localDate].hours += Number(shift.hoursDecimal || 0);
  });

  let runningPoints = 0;
  let runningHours = 0;
  return buildDateSpan_(startDate, endDate).map(function (localDate) {
    const day = grouped[localDate] || { points: 0, hours: 0 };
    runningPoints += day.points;
    runningHours += day.hours;
    return {
      date: localDate,
      label: shortDateLabel_(localDate),
      points: roundTo_(runningPoints, 1),
      hours: roundTo_(runningHours, 2)
    };
  });
}

function buildHeatmapSeries_(studentShifts) {
  const maxDate = formatLocalDate_(new Date());
  const minDate = shiftLocalDateString_(maxDate, -83);
  const filtered = studentShifts.filter(function (shift) {
    return shift.localDate >= minDate && shift.localDate <= maxDate;
  });
  const grouped = {};
  filtered.forEach(function (shift) {
    if (!grouped[shift.localDate]) {
      grouped[shift.localDate] = { points: 0, hours: 0, status: shift.status };
    }
    grouped[shift.localDate].points += Number(shift.totalPoints || 0);
    grouped[shift.localDate].hours += Number(shift.hoursDecimal || 0);
    grouped[shift.localDate].status = shift.status;
  });

  const maxPoints = Math.max.apply(null, filtered.map(function (shift) {
    return Number(shift.totalPoints || 0);
  }).concat([0]));

  return buildDateSpan_(minDate, maxDate).map(function (localDate) {
    const value = grouped[localDate] || { points: 0, hours: 0, status: "NONE" };
    return {
      date: localDate,
      label: localDate,
      points: roundTo_(value.points, 1),
      hours: roundTo_(value.hours, 2),
      status: value.status,
      intensity: maxPoints > 0 ? roundTo_((value.points / maxPoints) * 100, 1) : 0
    };
  });
}

function buildCohortHeatmapSeries_(shifts) {
  const maxDate = formatLocalDate_(new Date());
  const minDate = shiftLocalDateString_(maxDate, -83);
  const grouped = {};

  shifts.forEach(function (shift) {
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

  const activeCounts = Object.keys(grouped).map(function (localDate) {
    return Object.keys(grouped[localDate].activeStudents).length;
  });
  const maxActive = Math.max.apply(null, activeCounts.concat([0]));

  return buildDateSpan_(minDate, maxDate).map(function (localDate) {
    const day = grouped[localDate] || { activeStudents: {}, points: 0, hours: 0 };
    const activeCount = Object.keys(day.activeStudents).length;
    return {
      date: localDate,
      label: localDate,
      activeStudents: activeCount,
      points: roundTo_(day.points, 1),
      hours: roundTo_(day.hours, 2),
      intensity: maxActive > 0 ? roundTo_((activeCount / maxActive) * 100, 1) : 0
    };
  });
}

function buildSiteBreakdown_(shifts) {
  const siteMap = {};
  shifts.forEach(function (shift) {
    const site = shift.site || "Unknown";
    if (!siteMap[site]) {
      siteMap[site] = {
        site: site,
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

  return Object.keys(siteMap).map(function (site) {
    return {
      site: site,
      points: roundTo_(siteMap[site].points, 1),
      hours: roundTo_(siteMap[site].hours, 2),
      completedShifts: siteMap[site].completedShifts
    };
  }).sort(function (a, b) {
    return b.points - a.points;
  });
}

function buildExceptionBreakdown_(shifts) {
  const buckets = {
    COMPLETE: 0,
    OPEN: 0,
    EXCEPTION: 0
  };

  shifts.forEach(function (shift) {
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

function buildStudentExceptions_(studentShifts) {
  return studentShifts.filter(function (shift) {
    return shift.status === "EXCEPTION" || shift.status === "OPEN";
  }).sort(sortShiftsDesc_).slice(0, 10).map(function (shift) {
    return {
      localDate: shift.localDate,
      status: shift.status,
      site: shift.site,
      message: shift.status === "OPEN"
        ? "Check-out still missing for this day."
        : (shift.notes || "Shift needs review."),
      checkInUtc: shift.checkInUtc,
      checkOutUtc: shift.checkOutUtc
    };
  });
}

function buildAdminExceptions_(shifts) {
  return shifts.filter(function (shift) {
    return shift.status === "EXCEPTION" || shift.status === "OPEN";
  }).sort(sortShiftsDesc_).slice(0, 20).map(function (shift) {
    return {
      studentId: shift.studentId,
      studentName: shift.studentName,
      localDate: shift.localDate,
      status: shift.status,
      site: shift.site,
      message: shift.status === "OPEN"
        ? "Checkout still missing."
        : (shift.notes || "Shift needs review."),
      lastActivityUtc: shift.checkOutUtc || shift.checkInUtc || ""
    };
  });
}

function buildAdminStudentRows_(analytics) {
  const ids = Object.keys(analytics.ranges.overall.metricsByStudent);
  return ids.map(function (studentId) {
    return {
      studentId: studentId,
      studentName: analytics.ranges.overall.metricsByStudent[studentId].studentName,
      week: analytics.ranges.week.metricsByStudent[studentId],
      month: analytics.ranges.month.metricsByStudent[studentId],
      overall: analytics.ranges.overall.metricsByStudent[studentId],
      selectedRange: analytics.ranges.overall.metricsByStudent[studentId]
    };
  }).sort(function (a, b) {
    return a.studentName < b.studentName ? -1 : 1;
  });
}

function buildTodaySummary_(allShifts, site) {
  const today = formatLocalDate_(new Date());
  const todaysShifts = filterShiftsBySite_(allShifts, site).filter(function (shift) {
    return shift.localDate === today;
  });

  const activeStudents = {};
  let completedShifts = 0;
  let openShifts = 0;
  let exceptions = 0;
  todaysShifts.forEach(function (shift) {
    activeStudents[shift.studentId] = true;
    if (COMPLETE_STATUSES[shift.status]) {
      completedShifts += 1;
    } else if (shift.status === "OPEN") {
      openShifts += 1;
    } else if (shift.status === "EXCEPTION") {
      exceptions += 1;
    }
  });

  return {
    localDate: today,
    activeStudents: Object.keys(activeStudents).length,
    completedShifts: completedShifts,
    openShifts: openShifts,
    exceptionCount: exceptions
  };
}

function filterAuditTrailForRange_(audits, range) {
  const bounds = getRangeBounds_(range);
  return audits.filter(function (entry) {
    return isLocalDateInRange_(entry.localDate, bounds);
  }).sort(function (a, b) {
    return new Date(b.timestampUtc).getTime() - new Date(a.timestampUtc).getTime();
  });
}

function buildStudentDirectory_(logs, points) {
  const directory = {};
  Object.keys(ACTIVE_STUDENTS).forEach(function (studentId) {
    directory[studentId] = ACTIVE_STUDENTS[studentId];
  });

  (logs || []).forEach(function (log) {
    if (log.studentId) {
      directory[log.studentId] = log.studentName || directory[log.studentId] || log.studentId;
    }
  });

  (points || []).forEach(function (row) {
    if (row.studentId) {
      directory[row.studentId] = row.studentName || directory[row.studentId] || row.studentId;
    }
  });

  return directory;
}

function getAllSites_(shifts, logs) {
  const sites = {};
  (shifts || []).forEach(function (shift) {
    if (shift.site) {
      sites[shift.site] = true;
    }
  });
  (logs || []).forEach(function (log) {
    if (log.site) {
      sites[log.site] = true;
    }
  });
  return Object.keys(sites).sort();
}

function listLogRecords_(logsSheet) {
  if (logsSheet.getLastRow() < 2) {
    return [];
  }

  const values = logsSheet.getDataRange().getValues();
  const headers = values[0].map(normalizeHeaderCell_);
  const index = buildHeaderIndex_(headers);
  const records = [];

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const timestampRaw = getCellByHeader_(row, index, "timestampUtc");
    if (!timestampRaw) {
      continue;
    }

    const timestamp = timestampRaw instanceof Date ? timestampRaw : new Date(timestampRaw);
    const metadata = parseJsonSafe_(getCellByHeader_(row, index, "metadata"));
    const timestampUtc = timestamp instanceof Date && !isNaN(timestamp.getTime())
      ? timestamp.toISOString()
      : stringify_(timestampRaw);

    records.push({
      eventId: stringify_(getCellByHeader_(row, index, "eventId")) || ("legacy-" + rowIndex),
      timestampUtc: timestampUtc,
      timestamp: timestamp instanceof Date && !isNaN(timestamp.getTime()) ? timestamp : new Date(timestampUtc),
      localDate: stringify_(getCellByHeader_(row, index, "localDate")) || formatLocalDate_(timestamp),
      studentId: stringify_(getCellByHeader_(row, index, "studentId")),
      studentName: stringify_(getCellByHeader_(row, index, "studentName")),
      action: stringify_(getCellByHeader_(row, index, "action")),
      site: stringify_(getCellByHeader_(row, index, "site")),
      lat: getCellByHeader_(row, index, "lat"),
      lng: getCellByHeader_(row, index, "lng"),
      metadata: metadata,
      source: stringify_(getCellByHeader_(row, index, "source")) || stringify_(metadata.source) || "legacy"
    });
  }

  records.sort(function (a, b) {
    return a.timestamp.getTime() - b.timestamp.getTime();
  });
  return records;
}

function listShiftRecords_(shiftsSheet) {
  if (shiftsSheet.getLastRow() < 2) {
    return [];
  }

  return shiftsSheet.getRange(2, 1, shiftsSheet.getLastRow() - 1, SHIFT_HEADERS.length).getValues().map(function (row) {
    return {
      shiftId: stringify_(row[0]),
      localDate: stringify_(row[1]),
      studentId: stringify_(row[2]),
      studentName: stringify_(row[3]),
      site: stringify_(row[4]),
      checkInUtc: stringify_(row[5]),
      checkOutUtc: stringify_(row[6]),
      durationMinutes: Number(row[7] || 0),
      hoursDecimal: Number(row[8] || 0),
      checkInPoints: Number(row[9] || 0),
      checkOutPoints: Number(row[10] || 0),
      totalPoints: Number(row[11] || 0),
      status: stringify_(row[12]),
      source: stringify_(row[13]),
      notes: stringify_(row[14])
    };
  });
}

function listPointRecords_(pointsSheet) {
  if (pointsSheet.getLastRow() < 2) {
    return [];
  }

  return pointsSheet.getRange(2, 1, pointsSheet.getLastRow() - 1, POINT_HEADERS.length).getValues().map(function (row) {
    return {
      studentId: stringify_(row[0]),
      studentName: stringify_(row[1]),
      baselinePoints: Number(row[2] || 0),
      earnedPoints: Number(row[3] || 0),
      totalPoints: Number(row[4] || 0),
      lastUpdated: row[5] instanceof Date ? row[5].toISOString() : stringify_(row[5])
    };
  }).sort(function (a, b) {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.studentName < b.studentName ? -1 : 1;
  });
}

function listAuditRecords_(auditSheet) {
  if (auditSheet.getLastRow() < 2) {
    return [];
  }

  return auditSheet.getRange(2, 1, auditSheet.getLastRow() - 1, AUDIT_HEADERS.length).getValues().map(function (row) {
    return {
      timestampUtc: row[0] instanceof Date ? row[0].toISOString() : stringify_(row[0]),
      localDate: stringify_(row[1]),
      actorType: stringify_(row[2]),
      studentId: stringify_(row[3]),
      action: stringify_(row[4]),
      outcomeCode: stringify_(row[5]),
      message: stringify_(row[6]),
      site: stringify_(row[7]),
      lat: row[8],
      lng: row[9],
      metadata: parseJsonSafe_(row[10])
    };
  });
}

function appendAudit_(auditSheet, entry) {
  if (!auditSheet || !entry) {
    return;
  }

  const now = new Date();
  auditSheet.appendRow([
    now.toISOString(),
    formatLocalDate_(now),
    stringify_(entry.actorType),
    stringify_(entry.studentId),
    stringify_(entry.action),
    stringify_(entry.outcomeCode),
    stringify_(entry.message),
    stringify_(entry.site),
    coerceNumber_(entry.lat),
    coerceNumber_(entry.lng),
    JSON.stringify(entry.metadata || {})
  ]);
}

function getBaselineMap_(pointsSheet) {
  const baselineMap = {};
  const rows = listPointRecords_(pointsSheet);
  rows.forEach(function (row) {
    baselineMap[row.studentId] = Number(row.baselinePoints || 0);
  });
  return baselineMap;
}

function computeDerivedFingerprint_(logsSheet, baselineMap) {
  const values = logsSheet.getDataRange().getDisplayValues();
  const flattenedLogs = values.map(function (row) {
    return row.join("|");
  }).join("\n");
  const baselineRows = Object.keys(baselineMap).sort().map(function (studentId) {
    return studentId + ":" + baselineMap[studentId];
  }).join("|");
  return sha256Hex_(flattenedLogs + "\n---\n" + baselineRows);
}

function writeSheetRows_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!rows || !rows.length) {
    return;
  }
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function serializeShiftRow_(shift) {
  return [
    shift.shiftId,
    shift.localDate,
    shift.studentId,
    shift.studentName,
    shift.site,
    shift.checkInUtc,
    shift.checkOutUtc,
    shift.durationMinutes,
    shift.hoursDecimal,
    shift.checkInPoints,
    shift.checkOutPoints,
    shift.totalPoints,
    shift.status,
    shift.source,
    shift.notes
  ];
}

function serializePointRow_(row) {
  return [
    row.studentId,
    row.studentName,
    row.baselinePoints,
    row.earnedPoints,
    row.totalPoints,
    row.lastUpdated
  ];
}

function findPointRow_(points, studentId) {
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].studentId === studentId) {
      return points[i];
    }
  }
  return null;
}

function requireAdminToken_(e) {
  cleanupExpiredSessions_();
  const token = stringify_(e && e.parameter && e.parameter.token);
  if (!token) {
    return errorResponse_(RESPONSE_CODES.authRequired, "Admin token required.");
  }

  const properties = PropertiesService.getScriptProperties();
  const rawSession = properties.getProperty("SESSION_" + token);
  if (!rawSession) {
    return errorResponse_(RESPONSE_CODES.authRequired, "Admin session is missing or expired.");
  }

  const session = parseJsonSafe_(rawSession);
  if (!session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) {
    properties.deleteProperty("SESSION_" + token);
    return errorResponse_(RESPONSE_CODES.authRequired, "Admin session has expired.");
  }

  return null;
}

function createAdminSession_() {
  const token = Utilities.getUuid().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + CONFIG.adminSessionHours * 60 * 60 * 1000).toISOString();
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty("SESSION_" + token, JSON.stringify({ expiresAt: expiresAt }));
  return {
    token: token,
    expiresAt: expiresAt
  };
}

function cleanupExpiredSessions_() {
  const properties = PropertiesService.getScriptProperties();
  const all = properties.getProperties();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf("SESSION_") !== 0) {
      return;
    }
    const session = parseJsonSafe_(all[key]);
    if (!session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) {
      properties.deleteProperty(key);
    }
  });
}

function getCachedPayload_(namespace, keyParts, producer) {
  const cache = CacheService.getScriptCache();
  const version = PropertiesService.getScriptProperties().getProperty("DATA_VERSION") || "0";
  const cacheKey = sha256Hex_([namespace, version].concat(keyParts || []).join("|"));
  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const payload = producer();
  cache.put(cacheKey, JSON.stringify(payload), CONFIG.cacheTtlSeconds);
  return payload;
}

function validateAttendancePayload_(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      code: RESPONSE_CODES.invalidPayload,
      message: "Request body is invalid."
    };
  }

  const requiredFields = ["studentId", "studentName", "action", "site", "lat", "lng"];
  for (let i = 0; i < requiredFields.length; i += 1) {
    const field = requiredFields[i];
    const value = payload[field];
    if (value === null || value === undefined || stringify_(value) === "") {
      return {
        code: RESPONSE_CODES.missingField,
        message: "Missing required field: " + field
      };
    }
  }

  const action = stringify_(payload.action);
  if (action !== "Check In" && action !== "Check Out") {
    return {
      code: RESPONSE_CODES.invalidAction,
      message: "Action must be Check In or Check Out."
    };
  }

  return null;
}

function buildStudentAuditFromPayload_(payload, code, message, extra) {
  const safePayload = payload || {};
  const metadata = {
    clientTimestamp: stringify_(safePayload.clientTimestamp),
    userAgent: stringify_(safePayload.userAgent),
    extra: extra || {}
  };

  return {
    actorType: "STUDENT",
    studentId: stringify_(safePayload.studentId),
    action: stringify_(safePayload.action) || "ATTENDANCE_SUBMIT",
    outcomeCode: code,
    message: message,
    site: stringify_(safePayload.site),
    lat: safePayload.lat,
    lng: safePayload.lng,
    metadata: metadata
  };
}

function parsePayload_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== "string") {
    throw new Error("Missing request body.");
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error("Request body must be valid JSON.");
  }
}

function normalizeMode_(mode) {
  return stringify_(mode).toLowerCase() || "student_dashboard";
}

function normalizeRange_(range) {
  const normalized = stringify_(range).toLowerCase() || "overall";
  if (RANGE_KEYS.indexOf(normalized) === -1) {
    throw new Error("Range must be week, month, or overall.");
  }
  return normalized;
}

function normalizeSite_(site) {
  return stringify_(site) || "all";
}

function getRangeBounds_(range) {
  if (range === "overall") {
    return {
      start: "",
      end: formatLocalDate_(new Date())
    };
  }

  const today = formatLocalDate_(new Date());
  if (range === "month") {
    return {
      start: today.slice(0, 8) + "01",
      end: today
    };
  }

  const weekday = Number(Utilities.formatDate(new Date(), CONFIG.timezone, "u"));
  return {
    start: shiftLocalDateString_(today, -(weekday - 1)),
    end: today
  };
}

function filterShiftsByRange_(shifts, range) {
  const bounds = getRangeBounds_(range);
  return shifts.filter(function (shift) {
    return isLocalDateInRange_(shift.localDate, bounds);
  });
}

function resolveSeriesBounds_(bounds, shifts) {
  const end = bounds.end || formatLocalDate_(new Date());
  if (bounds.start) {
    return {
      start: bounds.start,
      end: end
    };
  }

  const ordered = shifts.slice().sort(function (a, b) {
    return a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0;
  });
  return {
    start: ordered.length ? ordered[0].localDate : end,
    end: end
  };
}

function filterShiftsBySite_(shifts, site) {
  if (!site || site === "all") {
    return shifts.slice();
  }
  return shifts.filter(function (shift) {
    return shift.site === site;
  });
}

function isLocalDateInRange_(localDate, bounds) {
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

function buildDateSpan_(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) {
    return [];
  }

  const dates = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = shiftLocalDateString_(cursor, 1);
  }
  return dates;
}

function shiftLocalDateString_(localDate, dayDelta) {
  const parts = localDate.split("-");
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return Utilities.formatDate(date, "UTC", "yyyy-MM-dd");
}

function shortDateLabel_(localDate) {
  const date = new Date(localDate + "T00:00:00Z");
  return Utilities.formatDate(date, "UTC", "MMM d");
}

function rangeLabel_(range) {
  if (range === "week") {
    return "This Week";
  }
  if (range === "month") {
    return "This Month";
  }
  return "Overall";
}

function siteLabel_(site) {
  return !site || site === "all" ? "All Sites" : site;
}

function sortShiftsDesc_(a, b) {
  const aStamp = a.checkOutUtc || a.checkInUtc || a.localDate;
  const bStamp = b.checkOutUtc || b.checkInUtc || b.localDate;
  if (aStamp === bStamp) {
    return a.localDate < b.localDate ? 1 : -1;
  }
  return aStamp < bStamp ? 1 : -1;
}

function parseJsonSafe_(raw) {
  if (!raw || typeof raw !== "string") {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function buildHeaderIndex_(headers) {
  const index = {};
  headers.forEach(function (header, position) {
    if (header) {
      index[header] = position;
    }
  });
  return index;
}

function getCellByHeader_(row, index, header) {
  if (!index.hasOwnProperty(header)) {
    return "";
  }
  return row[index[header]];
}

function normalizeHeaderCell_(value) {
  return stringify_(value);
}

function formatLocalDate_(dateObj) {
  return Utilities.formatDate(dateObj, CONFIG.timezone, "yyyy-MM-dd");
}

function coerceNumber_(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : "";
}

function stringify_(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function roundTo_(value, places) {
  const factor = Math.pow(10, places || 0);
  return Math.round(Number(value || 0) * factor) / factor;
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function (byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return (normalized < 16 ? "0" : "") + normalized.toString(16);
  }).join("");
}

function getAdminPasswordHash_() {
  const scriptHash = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD_HASH");
  return scriptHash || CONFIG.adminPasswordHash;
}

function errorResponse_(code, message, extra) {
  const payload = {
    ok: false,
    code: code,
    message: message
  };

  if (extra && typeof extra === "object") {
    Object.keys(extra).forEach(function (key) {
      payload[key] = extra[key];
    });
  }

  return jsonResponse_(payload);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
