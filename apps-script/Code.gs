const CONFIG = {
  spreadsheetId: "1Dd4qJ3SkARcigi-kmM9wCUc9NkRqpQoEkFVri7_FKlY",
  timezone: "America/Los_Angeles",
  goLiveDate: "2026-02-24",
  pointsPerAction: 5,
  minMinutesBetweenInOut: 60,
  adminSessionHours: 8,
  cacheTtlSeconds: 60,
  cacheValueMaxBytes: 95 * 1024,
  logsSheetName: "Logs",
  shiftsSheetName: "Shifts",
  pointsSheetName: "Points",
  auditSheetName: "Audit",
  rosterSheetName: "Roster",
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

const ROSTER_HEADERS = [
  "studentId",
  "studentName",
  "status"
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
      const freshness = ensureDerivedSheetsFresh_(context);
      const materialized = buildMaterializedState_(context, freshness.derivedState, {
        includeLogs: true
      });
      return jsonResponse_({ ok: true, data: materialized.logs });
    }

    if (mode === "points") {
      const freshness = ensureDerivedSheetsFresh_(context);
      const materialized = buildMaterializedState_(context, freshness.derivedState, {
        includePoints: true
      });
      return jsonResponse_({ ok: true, data: materialized.points });
    }

    if (mode === "student_dashboard") {
      const studentId = stringify_(e && e.parameter && e.parameter.studentId);
      const range = normalizeRange_(e && e.parameter && e.parameter.range);
      if (!studentId) {
        return errorResponse_(RESPONSE_CODES.missingField, "Missing required field: studentId");
      }

      const freshness = ensureDerivedSheetsFresh_(context);
      const dashboard = getCachedPayload_("student_dashboard", [studentId, range], function () {
        const materialized = buildMaterializedState_(context, freshness.derivedState, {
          includePoints: true
        });
        return getStudentDashboardPayload_(materialized, studentId, range);
      });
      return jsonResponse_({ ok: true, data: dashboard });
    }

    if (mode === "admin_dashboard") {
      const range = normalizeRange_(e && e.parameter && e.parameter.range);
      const site = normalizeSite_(e && e.parameter && e.parameter.site);
      const freshness = ensureDerivedSheetsFresh_(context);
      const payload = getCachedPayload_("admin_dashboard", [range, site], function () {
        const materialized = buildMaterializedState_(context, freshness.derivedState, {
          includeAudits: true
        });
        return getAdminDashboardPayload_(materialized, range, site);
      });
      return jsonResponse_({ ok: true, data: payload });
    }

    if (mode === "report_data") {
      const type = stringify_(e && e.parameter && e.parameter.type).toLowerCase();
      const range = normalizeRange_(e && e.parameter && e.parameter.range);
      const site = normalizeSite_(e && e.parameter && e.parameter.site);
      const studentId = stringify_(e && e.parameter && e.parameter.studentId);
      const freshness = ensureDerivedSheetsFresh_(context);
      const payload = getCachedPayload_("report_data", [type, range, site, studentId], function () {
        const materialized = buildMaterializedState_(context, freshness.derivedState, {
          includeAudits: type === "cohort",
          includePoints: type === "student"
        });
        return getReportPayload_(materialized, type, range, site, studentId);
      });
      return jsonResponse_({ ok: true, data: payload });
    }

    if (mode === "get_roster") {
      const roster = getActiveStudentsFromSheet_(context);
      return jsonResponse_({ ok: true, data: roster });
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

    const roster = getActiveStudentsFromSheet_(context);
    const studentId = stringify_(payload.studentId);
    const studentName = roster[studentId] || stringify_(payload.studentName);
    if (!roster[studentId]) {
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
    const baselines = getBaselineMap_(context.pointsSheet);
    const shiftRecords = listShiftRecords_(context.shiftsSheet);
    const existingShift = findShiftRecordForDay_(shiftRecords, studentId, localDate);

    if (action === "Check In" && existingShift && existingShift.checkInUtc) {
      appendAudit_(context.auditSheet, buildStudentAuditFromPayload_(payload, RESPONSE_CODES.alreadyCheckedIn, "You already checked in today."));
      return errorResponse_(RESPONSE_CODES.alreadyCheckedIn, "You already checked in today.");
    }

    if (action === "Check Out") {
      if (existingShift && existingShift.checkOutUtc) {
        appendAudit_(context.auditSheet, buildStudentAuditFromPayload_(payload, RESPONSE_CODES.alreadyCheckedOut, "You already checked out today."));
        return errorResponse_(RESPONSE_CODES.alreadyCheckedOut, "You already checked out today.");
      }

      if (!existingShift || !existingShift.checkInUtc) {
        appendAudit_(context.auditSheet, buildStudentAuditFromPayload_(payload, RESPONSE_CODES.checkinRequired, "You must check in first before checking out."));
        return errorResponse_(RESPONSE_CODES.checkinRequired, "You must check in first before checking out.");
      }

      const checkInTime = new Date(existingShift.checkInUtc);
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

    const updatedShift = buildLiveShiftRecord_(existingShift, {
      action: action,
      now: now,
      localDate: localDate,
      studentId: studentId,
      studentName: studentName,
      site: stringify_(payload.site),
      source: source
    });
    upsertShiftRecord_(context.shiftsSheet, updatedShift, existingShift ? existingShift.rowNumber : 0);

    const nextShiftRecords = upsertShiftCollection_(shiftRecords, updatedShift);
    const pointRecords = listPointRecords_(context.pointsSheet);
    const updatedPoint = buildPointRecordForStudent_(nextShiftRecords, baselines, roster, pointRecords, studentId, studentName);
    upsertPointRecord_(context.pointsSheet, updatedPoint, findPointRow_(pointRecords, studentId));
    const nextPointRecords = upsertPointCollection_(pointRecords, updatedPoint);
    syncDerivedSignatureAndVersion_(context.logsSheet, baselines);

    const materialized = {
      logs: [],
      audits: [],
      shifts: nextShiftRecords,
      points: nextPointRecords,
      studentDirectory: buildStudentDirectory_(null, nextPointRecords, nextShiftRecords, roster),
      sites: getAllSites_(nextShiftRecords, [])
    };
    const pointsDelta = localDate >= CONFIG.goLiveDate ? CONFIG.pointsPerAction : 0;
    const dashboard = getStudentDashboardPayload_(materialized, studentId, "week");

    return jsonResponse_({
      ok: true,
      code: RESPONSE_CODES.recorded,
      pointsDelta: pointsDelta,
      totalPoints: updatedPoint ? updatedPoint.totalPoints : pointsDelta,
      localDate: localDate,
      action: action,
      dashboard: dashboard
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

function getActiveStudentsFromSheet_(context) {
  seedRosterIfEmpty_(context.rosterSheet);
  const cache = CacheService.getScriptCache();
  const cacheKey = "active_roster_v1";
  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  const values = context.rosterSheet.getDataRange().getValues();
  const index = buildHeaderIndex_(values[0].map(normalizeHeaderCell_));
  const roster = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = normalizeStudentId_(getCellByHeader_(row, index, "studentId"));
    const name = stringify_(getCellByHeader_(row, index, "studentName"));
    const status = stringify_(getCellByHeader_(row, index, "status")).toLowerCase();

    if (id && name && status !== "inactive") {
      roster[id] = name;
    }
  }
  cachePayloadSafely_(cache, cacheKey, roster);
  return roster;
}

function seedRosterIfEmpty_(rosterSheet) {
  if (rosterSheet.getLastRow() >= 2) {
    return;
  }

  const students = {
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

  const rows = Object.keys(students).map(function (id) {
    return [id, students[id], "active"];
  });
  rosterSheet.getRange(2, 1, rows.length, 3).setValues(rows);
}

function ensureSchema_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const logsSheet = ensureLogsSheet_(spreadsheet);
  const shiftsSheet = ensureSheetWithHeaders_(spreadsheet, CONFIG.shiftsSheetName, SHIFT_HEADERS);
  const pointsSheet = ensureSheetWithHeaders_(spreadsheet, CONFIG.pointsSheetName, POINT_HEADERS);
  const auditSheet = ensureSheetWithHeaders_(spreadsheet, CONFIG.auditSheetName, AUDIT_HEADERS);
  const rosterSheet = ensureSheetWithHeaders_(spreadsheet, CONFIG.rosterSheetName, ROSTER_HEADERS);

  return {
    spreadsheet: spreadsheet,
    logsSheet: logsSheet,
    shiftsSheet: shiftsSheet,
    pointsSheet: pointsSheet,
    auditSheet: auditSheet,
    rosterSheet: rosterSheet
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
  const fingerprint = computeSourceSignature_(context.logsSheet, baselines);
  const scriptProperties = PropertiesService.getScriptProperties();
  const priorFingerprint = scriptProperties.getProperty("DERIVED_SOURCE_SIGNATURE") || "";
  const shouldRebuild = Boolean(options && options.force) || fingerprint !== priorFingerprint;

  if (shouldRebuild) {
    const logs = listLogRecords_(context.logsSheet);
    const audits = listAuditRecords_(context.auditSheet);
    const roster = getActiveStudentsFromSheet_(context);
    const derivedState = buildDerivedState_(logs, audits, baselines, roster);
    writeSheetRows_(context.shiftsSheet, SHIFT_HEADERS, derivedState.shiftRows);
    writeSheetRows_(context.pointsSheet, POINT_HEADERS, derivedState.pointRows);
    scriptProperties.setProperty("DERIVED_SOURCE_SIGNATURE", fingerprint);
    scriptProperties.setProperty("DATA_VERSION", String(new Date().getTime()));
    return {
      derivedState: derivedState
    };
  }

  return {
    derivedState: null
  };
}

/**
 * Manual maintenance utility for Apps Script editor runs.
 * Forces a full derived rebuild (Shifts + Points) and returns integrity diagnostics.
 */
function rebuildDerivedSheetsNow() {
  const lock = LockService.getScriptLock();
  let hasLock = false;
  lock.waitLock(20000);
  hasLock = true;
  try {
    const context = ensureSchema_();
    const freshness = ensureDerivedSheetsFresh_(context, { force: true });
    const derivedState = freshness.derivedState || buildMaterializedState_(context, null, { includePoints: true });
    const shifts = derivedState.shifts || [];
    const invalidPointRows = shifts.filter(function (shift) {
      const validPointSet = shift.checkInPoints === 0 || shift.checkInPoints === CONFIG.pointsPerAction;
      const validCheckoutSet = shift.checkOutPoints === 0 || shift.checkOutPoints === CONFIG.pointsPerAction;
      const validMax = Number(shift.totalPoints || 0) <= CONFIG.pointsPerAction * 2;
      const validSum = Number(shift.totalPoints || 0) === Number(shift.checkInPoints || 0) + Number(shift.checkOutPoints || 0);
      return !(validPointSet && validCheckoutSet && validMax && validSum);
    });

    const result = {
      ok: invalidPointRows.length === 0,
      rebuiltAt: new Date().toISOString(),
      pointsPerAction: CONFIG.pointsPerAction,
      maxDailyPoints: CONFIG.pointsPerAction * 2,
      totalShifts: shifts.length,
      totalPointsRows: (derivedState.points || []).length,
      invalidShiftRows: invalidPointRows.length,
      sampleInvalidShiftIds: invalidPointRows.slice(0, 10).map(function (row) {
        return row.shiftId;
      })
    };

    Logger.log("Derived rebuild result: %s", JSON.stringify(result));
    return result;
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

function buildMaterializedState_(context, derivedState, options) {
  const includeLogs = Boolean(options && options.includeLogs);
  const includeAudits = Boolean(options && options.includeAudits);
  const includePoints = !options || options.includePoints !== false;
  const logs = includeLogs
    ? (derivedState && derivedState.logs ? derivedState.logs : listLogRecords_(context.logsSheet))
    : [];
  const audits = includeAudits
    ? (derivedState && derivedState.audits ? derivedState.audits : listAuditRecords_(context.auditSheet))
    : [];
  const shifts = derivedState && derivedState.shifts ? derivedState.shifts : listShiftRecords_(context.shiftsSheet);
  const points = includePoints
    ? (derivedState && derivedState.points ? derivedState.points : listPointRecords_(context.pointsSheet))
    : [];
  const roster = getActiveStudentsFromSheet_(context);
  const studentDirectory = buildStudentDirectory_(logs, points, shifts, roster);

  return {
    logs: logs,
    audits: audits,
    shifts: shifts,
    points: points,
    studentDirectory: studentDirectory,
    sites: getAllSites_(shifts, logs)
  };
}

function buildDerivedState_(logs, audits, baselineMap, roster) {
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
    const shift = deriveShiftForDay_(grouped[key], roster);
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

  const studentDirectory = buildStudentDirectory_(logs, null, null, roster);
  const pointRecords = buildPointRecords_(shiftRecords, baselineMap, studentDirectory);

  return {
    logs: logs,
    shifts: shiftRecords,
    shiftRows: shiftRecords.map(serializeShiftRow_),
    points: pointRecords,
    pointRows: pointRecords.map(serializePointRow_),
    audits: audits || [],
    studentDirectory: studentDirectory
  };
}

function deriveShiftForDay_(events, roster) {
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
  const studentName = first.studentName || (roster ? roster[studentId] : studentId);
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
      studentName: studentDirectory[studentId],
      name: studentDirectory[studentId]
    },
    currentRange: range,
    week: {
      totalPoints: roundTo_(Number((summaries.week && summaries.week.points) || 0), 1),
      hoursDecimal: roundTo_(Number((summaries.week && summaries.week.hours) || 0), 2)
    },
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
  const todayStudents = buildTodayStudentRows_(derivedState.shifts, site);

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
    todayStudents: todayStudents,
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

function buildTodayStudentRows_(allShifts, site) {
  const today = formatLocalDate_(new Date());
  return filterShiftsBySite_(allShifts, site).filter(function (shift) {
    return shift.localDate === today;
  }).sort(sortShiftsDesc_).map(function (shift) {
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
      status: status,
      isActive: isActive,
      checkInUtc: shift.checkInUtc || "",
      checkOutUtc: shift.checkOutUtc || "",
      site: shift.site || "",
      durationMinutes: durationMinutes,
      hoursDecimal: roundTo_(durationMinutes / 60, 2),
      totalPoints: Number(shift.totalPoints || 0)
    };
  });
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

function buildStudentDirectory_(logs, points, shifts, roster) {
  const directory = {};
  if (roster) {
    Object.keys(roster).forEach(function (studentId) {
      directory[studentId] = roster[studentId];
    });
  }

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

  (shifts || []).forEach(function (row) {
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
    const timestampRaw = getCellByHeader_(row, index, "timestampUtc") || row[0];
    if (!timestampRaw) {
      continue;
    }

    const timestamp = timestampRaw instanceof Date ? timestampRaw : new Date(timestampRaw);
    const timestampUtc = timestamp instanceof Date && !isNaN(timestamp.getTime())
      ? timestamp.toISOString()
      : stringify_(timestampRaw);
    const metadata = resolveLogMetadata_(row, index);
    const coordinates = resolveLogCoordinates_(row, index);
    const localDate = resolveLogLocalDate_(row, index, timestamp);

    records.push({
      eventId: resolveLogEventId_(row, index, rowIndex),
      timestampUtc: timestampUtc,
      timestamp: timestamp instanceof Date && !isNaN(timestamp.getTime()) ? timestamp : new Date(timestampUtc),
      localDate: localDate,
      studentId: normalizeStudentId_(getCellByHeader_(row, index, "studentId") || row[1]),
      studentName: stringify_(getCellByHeader_(row, index, "studentName")),
      action: stringify_(getCellByHeader_(row, index, "action")),
      site: stringify_(getCellByHeader_(row, index, "site")),
      lat: coordinates.lat,
      lng: coordinates.lng,
      metadata: metadata,
      source: resolveLogSource_(row, index, metadata)
    });
  }

  records.sort(function (a, b) {
    return a.timestamp.getTime() - b.timestamp.getTime();
  });
  return records;
}

function resolveLogCoordinates_(row, index) {
  const candidates = [
    [getCellByHeader_(row, index, "lat"), getCellByHeader_(row, index, "lng")],
    [row[7], row[8]],
    [row[5], row[6]]
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const lat = coerceCoordinate_(candidates[i][0], -90, 90);
    const lng = coerceCoordinate_(candidates[i][1], -180, 180);
    if (lat !== "" && lng !== "") {
      return { lat: lat, lng: lng };
    }
  }

  return { lat: "", lng: "" };
}

function resolveLogLocalDate_(row, index, timestamp) {
  const candidates = [
    getCellByHeader_(row, index, "localDate"),
    row[7],
    row[8]
  ];

  for (let i = 0; i < candidates.length; i += 1) {
    const value = candidates[i];
    if (value instanceof Date && !isNaN(value.getTime())) {
      return formatLocalDate_(value);
    }
    const localDate = stringify_(value);
    if (isLocalDateString_(localDate)) {
      return localDate;
    }
  }

  return formatLocalDate_(timestamp);
}

function resolveLogMetadata_(row, index) {
  const metadataCandidates = [
    getCellByHeader_(row, index, "metadata"),
    row[8],
    row[9]
  ];

  for (let i = 0; i < metadataCandidates.length; i += 1) {
    const value = metadataCandidates[i];
    if (!value) {
      continue;
    }
    if (typeof value === "string" && value.charAt(0) === "{") {
      return parseJsonSafe_(value);
    }
    if (looksLikeUserAgent_(value)) {
      return { userAgent: stringify_(value) };
    }
  }

  return {};
}

function resolveLogEventId_(row, index, rowIndex) {
  const explicitEventId = stringify_(getCellByHeader_(row, index, "eventId"));
  if (explicitEventId && !looksLikeUserAgent_(explicitEventId)) {
    return explicitEventId;
  }
  return "legacy-" + rowIndex;
}

function resolveLogSource_(row, index, metadata) {
  const explicitSource = stringify_(getCellByHeader_(row, index, "source") || row[10]);
  if (explicitSource && !looksLikeUserAgent_(explicitSource)) {
    return explicitSource;
  }
  return stringify_(metadata.source) || "legacy";
}

function listShiftRecords_(shiftsSheet) {
  if (shiftsSheet.getLastRow() < 2) {
    return [];
  }

  return shiftsSheet.getRange(2, 1, shiftsSheet.getLastRow() - 1, SHIFT_HEADERS.length).getValues().map(function (row, index) {
    const localDate = normalizeLocalDateCell_(row[1]);
    const checkInUtc = normalizeUtcTimestampCell_(row[5]);
    const checkOutUtc = normalizeUtcTimestampCell_(row[6]);
    return {
      rowNumber: index + 2,
      shiftId: stringify_(row[0]),
      localDate: localDate,
      studentId: normalizeStudentId_(row[2]),
      studentName: stringify_(row[3]),
      site: stringify_(row[4]),
      checkInUtc: checkInUtc,
      checkOutUtc: checkOutUtc,
      durationMinutes: Number(row[7] || 0),
      hoursDecimal: Number(row[8] || 0),
      checkInPoints: Number(row[9] || 0),
      checkOutPoints: Number(row[10] || 0),
      totalPoints: Number(row[11] || 0),
      status: stringify_(row[12]),
      source: stringify_(row[13]),
      notes: stringify_(row[14])
    };
  }).filter(function (row) {
    return row.localDate && row.studentId;
  });
}

function listPointRecords_(pointsSheet) {
  if (pointsSheet.getLastRow() < 2) {
    return [];
  }

  return pointsSheet.getRange(2, 1, pointsSheet.getLastRow() - 1, POINT_HEADERS.length).getValues().map(function (row, index) {
    return {
      rowNumber: index + 2,
      studentId: normalizeStudentId_(row[0]),
      studentName: stringify_(row[1]),
      baselinePoints: Number(row[2] || 0),
      earnedPoints: Number(row[3] || 0),
      totalPoints: Number(row[4] || 0),
      lastUpdated: normalizeUtcTimestampCell_(row[5])
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
    const timestampUtc = normalizeUtcTimestampCell_(row[0]);
    const localDate = normalizeLocalDateCell_(row[1]) || (timestampUtc ? formatLocalDate_(new Date(timestampUtc)) : "");
    return {
      timestampUtc: timestampUtc,
      localDate: localDate,
      actorType: stringify_(row[2]),
      studentId: normalizeStudentId_(row[3]),
      action: stringify_(row[4]),
      outcomeCode: stringify_(row[5]),
      message: stringify_(row[6]),
      site: stringify_(row[7]),
      lat: coerceNumber_(row[8]),
      lng: coerceNumber_(row[9]),
      metadata: parseJsonSafe_(row[10])
    };
  }).filter(function (row) {
    return Boolean(row.timestampUtc);
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

function computeSourceSignature_(logsSheet, baselineMap) {
  const lastRow = logsSheet.getLastRow();
  const lastColumn = Math.min(logsSheet.getLastColumn(), LOG_HEADERS.length);
  let lastRowSignature = "";
  if (lastRow >= 2 && lastColumn > 0) {
    lastRowSignature = logsSheet.getRange(lastRow, 1, 1, lastColumn).getDisplayValues()[0].join("|");
  }
  const baselineRows = Object.keys(baselineMap).sort().map(function (studentId) {
    return studentId + ":" + baselineMap[studentId];
  }).join("|");
  return sha256Hex_([
    String(lastRow),
    String(lastColumn),
    lastRowSignature,
    baselineRows,
    "POINTS_PER_ACTION=" + String(CONFIG.pointsPerAction),
    "GO_LIVE_DATE=" + String(CONFIG.goLiveDate),
    "MIN_MINUTES_IN_OUT=" + String(CONFIG.minMinutesBetweenInOut)
  ].join("\n---\n"));
}

function syncDerivedSignatureAndVersion_(logsSheet, baselineMap) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty("DERIVED_SOURCE_SIGNATURE", computeSourceSignature_(logsSheet, baselineMap));
  scriptProperties.setProperty("DATA_VERSION", String(new Date().getTime()));
}

function findShiftRecordForDay_(shifts, studentId, localDate) {
  for (let i = 0; i < shifts.length; i += 1) {
    if (shifts[i].studentId === studentId && shifts[i].localDate === localDate) {
      return shifts[i];
    }
  }
  return null;
}

function buildLiveShiftRecord_(existingShift, options) {
  const now = options.now;
  const action = options.action;
  const localDate = options.localDate;
  const studentId = options.studentId;
  const studentName = options.studentName;
  const site = options.site || (existingShift && existingShift.site) || "";
  const eligibleForPoints = localDate >= CONFIG.goLiveDate;
  const nextShift = existingShift ? {
    shiftId: existingShift.shiftId,
    localDate: existingShift.localDate,
    studentId: existingShift.studentId,
    studentName: existingShift.studentName,
    site: existingShift.site,
    checkInUtc: existingShift.checkInUtc,
    checkOutUtc: existingShift.checkOutUtc,
    durationMinutes: Number(existingShift.durationMinutes || 0),
    hoursDecimal: Number(existingShift.hoursDecimal || 0),
    checkInPoints: Number(existingShift.checkInPoints || 0),
    checkOutPoints: Number(existingShift.checkOutPoints || 0),
    totalPoints: Number(existingShift.totalPoints || 0),
    status: existingShift.status,
    source: existingShift.source,
    notes: existingShift.notes || ""
  } : {
    shiftId: studentId + "-" + localDate,
    localDate: localDate,
    studentId: studentId,
    studentName: studentName,
    site: site,
    checkInUtc: "",
    checkOutUtc: "",
    durationMinutes: 0,
    hoursDecimal: 0,
    checkInPoints: 0,
    checkOutPoints: 0,
    totalPoints: 0,
    status: "NOT_STARTED",
    source: options.source || "web",
    notes: ""
  };

  nextShift.studentName = studentName || nextShift.studentName || studentId;
  nextShift.site = site;
  nextShift.source = options.source || nextShift.source || "web";
  nextShift.notes = "";

  if (action === "Check In") {
    nextShift.checkInUtc = now.toISOString();
    nextShift.checkOutUtc = "";
    nextShift.durationMinutes = 0;
    nextShift.hoursDecimal = 0;
    nextShift.checkInPoints = eligibleForPoints ? CONFIG.pointsPerAction : 0;
    nextShift.checkOutPoints = 0;
    nextShift.totalPoints = nextShift.checkInPoints;
    nextShift.status = "OPEN";
    return nextShift;
  }

  const checkInUtc = nextShift.checkInUtc || "";
  const checkInDate = new Date(checkInUtc);
  const durationMinutes = Math.max(0, Math.round((now.getTime() - checkInDate.getTime()) / 60000));
  nextShift.checkOutUtc = now.toISOString();
  nextShift.durationMinutes = durationMinutes;
  nextShift.hoursDecimal = roundTo_(durationMinutes / 60, 2);
  nextShift.checkOutPoints = eligibleForPoints ? CONFIG.pointsPerAction : 0;
  nextShift.totalPoints = Number(nextShift.checkInPoints || 0) + Number(nextShift.checkOutPoints || 0);
  nextShift.status = eligibleForPoints ? "COMPLETE" : "BACKFILLED_COMPLETE";
  return nextShift;
}

function upsertShiftCollection_(shifts, updatedShift) {
  const nextShifts = [];
  let replaced = false;
  for (let i = 0; i < shifts.length; i += 1) {
    const row = shifts[i];
    if (row.studentId === updatedShift.studentId && row.localDate === updatedShift.localDate) {
      nextShifts.push(updatedShift);
      replaced = true;
    } else {
      nextShifts.push(row);
    }
  }
  if (!replaced) {
    nextShifts.push(updatedShift);
  }
  return nextShifts;
}

function upsertShiftRecord_(shiftsSheet, shift, rowNumber) {
  const values = [serializeShiftRow_(shift)];
  if (rowNumber) {
    shiftsSheet.getRange(rowNumber, 1, 1, SHIFT_HEADERS.length).setValues(values);
    return;
  }
  shiftsSheet.appendRow(values[0]);
}

function buildPointRecordForStudent_(shifts, baselineMap, roster, currentPoints, studentId, studentName) {
  const existing = findPointRow_(currentPoints || [], studentId);
  const baselinePoints = Number(baselineMap[studentId] || (existing && existing.baselinePoints) || 0);
  const relevantShifts = (shifts || []).filter(function (shift) {
    return shift.studentId === studentId;
  });
  let earnedPoints = 0;
  let lastUpdated = existing && existing.lastUpdated ? existing.lastUpdated : "";

  relevantShifts.forEach(function (shift) {
    earnedPoints += Number(shift.totalPoints || 0);
    const latestShiftTimestamp = shift.checkOutUtc || shift.checkInUtc || "";
    if (latestShiftTimestamp && (!lastUpdated || latestShiftTimestamp > lastUpdated)) {
      lastUpdated = latestShiftTimestamp;
    }
  });

  return {
    studentId: studentId,
    studentName: (roster && roster[studentId]) || studentName || (existing && existing.studentName) || studentId,
    baselinePoints: baselinePoints,
    earnedPoints: roundTo_(earnedPoints, 2),
    totalPoints: roundTo_(baselinePoints + earnedPoints, 2),
    lastUpdated: lastUpdated
  };
}

function upsertPointCollection_(points, updatedPoint) {
  const nextPoints = [];
  let replaced = false;
  (points || []).forEach(function (row) {
    if (row.studentId === updatedPoint.studentId) {
      nextPoints.push(updatedPoint);
      replaced = true;
    } else {
      nextPoints.push(row);
    }
  });
  if (!replaced) {
    nextPoints.push(updatedPoint);
  }
  return nextPoints.sort(function (a, b) {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.studentName < b.studentName ? -1 : 1;
  });
}

function upsertPointRecord_(pointsSheet, pointRecord, existingPoint) {
  const values = [serializePointRow_(pointRecord)];
  if (existingPoint && existingPoint.rowNumber) {
    pointsSheet.getRange(existingPoint.rowNumber, 1, 1, POINT_HEADERS.length).setValues(values);
    return;
  }
  pointsSheet.appendRow(values[0]);
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
  cachePayloadSafely_(cache, cacheKey, payload);
  return payload;
}

function cachePayloadSafely_(cache, cacheKey, payload) {
  const serialized = JSON.stringify(payload);
  const byteLength = Utilities.newBlob(serialized).getBytes().length;
  if (byteLength > CONFIG.cacheValueMaxBytes) {
    Logger.log("Skipping cache write for %s because payload is %s bytes.", cacheKey, byteLength);
    return;
  }

  try {
    cache.put(cacheKey, serialized, CONFIG.cacheTtlSeconds);
  } catch (err) {
    Logger.log("Cache write skipped for %s: %s", cacheKey, err.message);
  }
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
    return isLocalDateInRange_(normalizeLocalDateCell_(shift.localDate), bounds);
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
  const canonicalDate = normalizeLocalDateCell_(localDate);
  if (!canonicalDate) {
    return false;
  }

  const start = normalizeLocalDateCell_(bounds && bounds.start) || "";
  const end = normalizeLocalDateCell_(bounds && bounds.end) || "";
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

function normalizeLocalDateCell_(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatLocalDate_(value);
  }

  const text = stringify_(value);
  if (!text) {
    return "";
  }

  if (isLocalDateString_(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (parsed instanceof Date && !isNaN(parsed.getTime())) {
    return formatLocalDate_(parsed);
  }

  return "";
}

function normalizeUtcTimestampCell_(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  const text = stringify_(value);
  if (!text) {
    return "";
  }

  if (isLocalDateString_(text)) {
    const dayStamp = new Date(text + "T00:00:00Z");
    return dayStamp instanceof Date && !isNaN(dayStamp.getTime()) ? dayStamp.toISOString() : "";
  }

  const parsed = new Date(text);
  if (parsed instanceof Date && !isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return "";
}

function normalizeStudentId_(value) {
  const studentId = stringify_(value);
  return /^\d+$/.test(studentId) ? studentId.padStart(6, "0") : studentId;
}

function isLocalDateString_(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(stringify_(value));
}

function coerceCoordinate_(value, min, max) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    return "";
  }
  return numberValue;
}

function looksLikeUserAgent_(value) {
  const text = stringify_(value);
  return Boolean(text) && (
    text.indexOf("Mozilla/") === 0 ||
    text.indexOf("AppleWebKit/") >= 0 ||
    text.indexOf("Chrome/") >= 0 ||
    text.indexOf("Safari/") >= 0 ||
    text.indexOf("Mobile/") >= 0
  );
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
