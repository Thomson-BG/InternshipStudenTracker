const crypto = require("crypto");
const { CONFIG, RESPONSE_CODES, RANGE_KEYS } = require("./config");
const { withClient, withTransaction } = require("./db");
const { ensureDatabaseReady } = require("./schema");
const { AppError } = require("./errors");
const { createAdminSession, isValidAdminPassword, requireAdminToken } = require("./auth");
const { stringify, normalizeStudentId, toNumber, round, pacificToday } = require("./utils");
const {
  buildStudentDashboardPayload,
  buildAdminDashboardPayload,
  buildReportPayload
} = require("./analytics");

function toIsoString(value) {
  if (!value) {
    return "";
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString();
}

function toLocalDateString(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      return "";
    }
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function normalizeRange(range) {
  const normalized = stringify(range).toLowerCase() || "overall";
  if (!RANGE_KEYS.includes(normalized)) {
    throw new AppError(RESPONSE_CODES.invalidRange, "Range must be week, month, or overall.", {
      statusCode: 400
    });
  }
  return normalized;
}

function normalizeSite(site) {
  return stringify(site) || "all";
}

function parseShiftRow(row) {
  return {
    shiftId: stringify(row.shift_id),
    localDate: toLocalDateString(row.local_date),
    studentId: normalizeStudentId(row.student_id),
    studentName: stringify(row.student_name),
    site: stringify(row.site),
    checkInUtc: toIsoString(row.check_in_utc),
    checkOutUtc: toIsoString(row.check_out_utc),
    durationMinutes: Number(row.duration_minutes || 0),
    hoursDecimal: Number(row.hours_decimal || 0),
    checkInPoints: Number(row.check_in_points || 0),
    checkOutPoints: Number(row.check_out_points || 0),
    totalPoints: Number(row.total_points || 0),
    status: stringify(row.status),
    source: stringify(row.source),
    notes: stringify(row.notes)
  };
}

function parseAuditRow(row) {
  return {
    timestampUtc: toIsoString(row.timestamp_utc),
    localDate: toLocalDateString(row.local_date),
    actorType: stringify(row.actor_type),
    studentId: normalizeStudentId(row.student_id),
    action: stringify(row.action),
    outcomeCode: stringify(row.outcome_code),
    message: stringify(row.message),
    site: stringify(row.site),
    lat: row.lat,
    lng: row.lng,
    metadata: row.metadata || {}
  };
}

function parsePointRow(row) {
  return {
    studentId: normalizeStudentId(row.student_id),
    studentName: stringify(row.student_name),
    baselinePoints: Number(row.baseline_points || 0),
    earnedPoints: Number(row.earned_points || 0),
    totalPoints: Number(row.total_points || 0),
    lastUpdated: toIsoString(row.last_updated)
  };
}

function parseLogRow(row) {
  return {
    eventId: stringify(row.event_id),
    timestampUtc: toIsoString(row.timestamp_utc),
    localDate: toLocalDateString(row.local_date),
    studentId: normalizeStudentId(row.student_id),
    studentName: stringify(row.student_name),
    action: stringify(row.action),
    site: stringify(row.site),
    lat: row.lat,
    lng: row.lng,
    metadata: row.metadata || {},
    source: stringify(row.source)
  };
}

function buildStudentDirectory(shifts, rosterMap) {
  const directory = { ...rosterMap };
  (shifts || []).forEach((shift) => {
    const studentId = normalizeStudentId(shift.studentId);
    if (studentId) {
      directory[studentId] = shift.studentName || directory[studentId] || studentId;
    }
  });
  return directory;
}

async function appendAudit(client, entry) {
  const now = new Date();
  const localDate = pacificToday(now);

  await client.query(
    `
    INSERT INTO audit_log (
      timestamp_utc,
      local_date,
      actor_type,
      student_id,
      action,
      outcome_code,
      message,
      site,
      lat,
      lng,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    `,
    [
      now.toISOString(),
      localDate,
      stringify(entry.actorType),
      normalizeStudentId(entry.studentId) || "",
      stringify(entry.action),
      stringify(entry.outcomeCode),
      stringify(entry.message),
      stringify(entry.site),
      entry.lat === "" || entry.lat === null || entry.lat === undefined ? null : Number(entry.lat),
      entry.lng === "" || entry.lng === null || entry.lng === undefined ? null : Number(entry.lng),
      JSON.stringify(entry.metadata || {})
    ]
  );
}

async function getActiveRosterMap(client) {
  const result = await client.query(
    `
    SELECT student_id, student_name
    FROM students
    WHERE COALESCE(status, 'active') <> 'inactive'
    ORDER BY student_name ASC
    `
  );

  const roster = {};
  result.rows.forEach((row) => {
    roster[normalizeStudentId(row.student_id)] = stringify(row.student_name);
  });
  return roster;
}

async function listShifts(client) {
  const result = await client.query(
    `
    SELECT
      shift_id,
      local_date,
      student_id,
      student_name,
      site,
      check_in_utc,
      check_out_utc,
      duration_minutes,
      hours_decimal,
      check_in_points,
      check_out_points,
      total_points,
      status,
      source,
      notes
    FROM shifts
    ORDER BY local_date DESC, COALESCE(check_out_utc, check_in_utc) DESC NULLS LAST
    `
  );

  return result.rows.map(parseShiftRow);
}

async function listAudit(client) {
  const result = await client.query(
    `
    SELECT
      timestamp_utc,
      local_date,
      actor_type,
      student_id,
      action,
      outcome_code,
      message,
      site,
      lat,
      lng,
      metadata
    FROM audit_log
    ORDER BY timestamp_utc DESC
    LIMIT 1500
    `
  );

  return result.rows.map(parseAuditRow);
}

async function listPoints(client) {
  const result = await client.query(
    `
    SELECT
      student_id,
      student_name,
      baseline_points,
      earned_points,
      total_points,
      last_updated
    FROM points
    ORDER BY total_points DESC, student_name ASC
    `
  );

  return result.rows.map(parsePointRow);
}

async function listLogs(client) {
  const result = await client.query(
    `
    SELECT
      event_id,
      timestamp_utc,
      local_date,
      student_id,
      student_name,
      action,
      site,
      lat,
      lng,
      metadata,
      source
    FROM attendance_events
    ORDER BY timestamp_utc DESC
    LIMIT 5000
    `
  );

  return result.rows.map(parseLogRow);
}

function validateAttendancePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new AppError(RESPONSE_CODES.invalidPayload, "Request body is invalid.", {
      statusCode: 400
    });
  }

  const required = ["studentId", "studentName", "action", "site", "lat", "lng"];
  for (const field of required) {
    const value = payload[field];
    if (value === null || value === undefined || stringify(value) === "") {
      throw new AppError(RESPONSE_CODES.missingField, `Missing required field: ${field}`, {
        statusCode: 400
      });
    }
  }

  const action = stringify(payload.action);
  if (action !== "Check In" && action !== "Check Out") {
    throw new AppError(RESPONSE_CODES.invalidAction, "Action must be Check In or Check Out.", {
      statusCode: 400
    });
  }
}

function buildLiveShiftRecord(existingShift, options) {
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
    shiftId: `${studentId}-${localDate}`,
    localDate,
    studentId,
    studentName,
    site,
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

  const checkInDate = new Date(nextShift.checkInUtc);
  const durationMinutes = Math.max(0, Math.round((now.getTime() - checkInDate.getTime()) / 60000));
  nextShift.checkOutUtc = now.toISOString();
  nextShift.durationMinutes = durationMinutes;
  nextShift.hoursDecimal = round(durationMinutes / 60, 2);
  nextShift.checkOutPoints = eligibleForPoints ? CONFIG.pointsPerAction : 0;
  nextShift.totalPoints = Number(nextShift.checkInPoints || 0) + Number(nextShift.checkOutPoints || 0);
  nextShift.status = eligibleForPoints ? "COMPLETE" : "BACKFILLED_COMPLETE";
  return nextShift;
}

async function upsertShift(client, shift) {
  await client.query(
    `
    INSERT INTO shifts (
      shift_id,
      local_date,
      student_id,
      student_name,
      site,
      check_in_utc,
      check_out_utc,
      duration_minutes,
      hours_decimal,
      check_in_points,
      check_out_points,
      total_points,
      status,
      source,
      notes,
      updated_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12,
      $13,
      $14,
      $15,
      NOW()
    )
    ON CONFLICT (student_id, local_date)
    DO UPDATE SET
      shift_id = EXCLUDED.shift_id,
      student_name = EXCLUDED.student_name,
      site = EXCLUDED.site,
      check_in_utc = EXCLUDED.check_in_utc,
      check_out_utc = EXCLUDED.check_out_utc,
      duration_minutes = EXCLUDED.duration_minutes,
      hours_decimal = EXCLUDED.hours_decimal,
      check_in_points = EXCLUDED.check_in_points,
      check_out_points = EXCLUDED.check_out_points,
      total_points = EXCLUDED.total_points,
      status = EXCLUDED.status,
      source = EXCLUDED.source,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    `,
    [
      shift.shiftId,
      shift.localDate,
      shift.studentId,
      shift.studentName,
      shift.site,
      shift.checkInUtc || null,
      shift.checkOutUtc || null,
      shift.durationMinutes,
      shift.hoursDecimal,
      shift.checkInPoints,
      shift.checkOutPoints,
      shift.totalPoints,
      shift.status,
      shift.source,
      shift.notes
    ]
  );
}

async function upsertPointsForStudent(client, studentRow, studentId, fallbackName) {
  const baseline = Number(studentRow?.baseline_points || 0);

  const aggregate = await client.query(
    `
    SELECT
      COALESCE(SUM(total_points), 0) AS earned_points,
      MAX(COALESCE(check_out_utc, check_in_utc)) AS last_updated
    FROM shifts
    WHERE student_id = $1
    `,
    [studentId]
  );

  const earnedPoints = Number(aggregate.rows[0]?.earned_points || 0);
  const lastUpdated = aggregate.rows[0]?.last_updated ? toIsoString(aggregate.rows[0].last_updated) : null;
  const totalPoints = round(baseline + earnedPoints, 2);

  await client.query(
    `
    INSERT INTO points (
      student_id,
      student_name,
      baseline_points,
      earned_points,
      total_points,
      last_updated,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (student_id)
    DO UPDATE SET
      student_name = EXCLUDED.student_name,
      baseline_points = EXCLUDED.baseline_points,
      earned_points = EXCLUDED.earned_points,
      total_points = EXCLUDED.total_points,
      last_updated = EXCLUDED.last_updated,
      updated_at = NOW()
    `,
    [
      studentId,
      stringify(studentRow?.student_name) || stringify(fallbackName) || studentId,
      baseline,
      round(earnedPoints, 2),
      totalPoints,
      lastUpdated
    ]
  );

  return {
    baseline,
    earnedPoints: round(earnedPoints, 2),
    totalPoints,
    lastUpdated: lastUpdated || ""
  };
}

async function loadStateForAnalytics(client) {
  const shifts = await listShifts(client);
  const rosterMap = await getActiveRosterMap(client);
  const auditTrail = await listAudit(client);

  return {
    shifts,
    auditTrail,
    rosterMap,
    studentDirectory: buildStudentDirectory(shifts, rosterMap)
  };
}

async function submitAttendance(payload) {
  await ensureDatabaseReady();

  const normalizedPayload = payload || {};
  validateAttendancePayload(normalizedPayload);

  const studentId = normalizeStudentId(normalizedPayload.studentId);
  const action = stringify(normalizedPayload.action);
  const site = stringify(normalizedPayload.site);
  const lat = toNumber(normalizedPayload.lat, NaN);
  const lng = toNumber(normalizedPayload.lng, NaN);

  if (!studentId) {
    throw new AppError(RESPONSE_CODES.missingField, "Missing required field: studentId", {
      statusCode: 400
    });
  }

  let responsePayload = null;

  await withTransaction(async (client) => {
    const studentResult = await client.query(
      `
      SELECT student_id, student_name, status, baseline_points
      FROM students
      WHERE student_id = $1
      LIMIT 1
      `,
      [studentId]
    );

    const studentRow = studentResult.rows[0] || null;
    const studentName = stringify(studentRow?.student_name) || stringify(normalizedPayload.studentName) || studentId;

    if (!studentRow || stringify(studentRow.status).toLowerCase() === "inactive") {
      await appendAudit(client, {
        actorType: "STUDENT",
        studentId,
        action,
        outcomeCode: RESPONSE_CODES.unknownStudent,
        message: "Student ID is not recognized.",
        site,
        lat,
        lng,
        metadata: {
          clientTimestamp: stringify(normalizedPayload.clientTimestamp),
          userAgent: stringify(normalizedPayload.userAgent),
          source: "attendance"
        }
      });

      throw new AppError(RESPONSE_CODES.unknownStudent, "Student ID is not recognized.", {
        statusCode: 400
      });
    }

    const now = new Date();
    const localDate = pacificToday(now);

    const existingShiftResult = await client.query(
      `
      SELECT
        shift_id,
        local_date,
        student_id,
        student_name,
        site,
        check_in_utc,
        check_out_utc,
        duration_minutes,
        hours_decimal,
        check_in_points,
        check_out_points,
        total_points,
        status,
        source,
        notes
      FROM shifts
      WHERE student_id = $1 AND local_date = $2
      FOR UPDATE
      `,
      [studentId, localDate]
    );

    const existingShift = existingShiftResult.rows.length ? parseShiftRow(existingShiftResult.rows[0]) : null;

    if (action === "Check In" && existingShift && existingShift.checkInUtc) {
      await appendAudit(client, {
        actorType: "STUDENT",
        studentId,
        action,
        outcomeCode: RESPONSE_CODES.alreadyCheckedIn,
        message: "You already checked in today.",
        site,
        lat,
        lng,
        metadata: {
          source: "attendance"
        }
      });

      throw new AppError(RESPONSE_CODES.alreadyCheckedIn, "You already checked in today.", {
        statusCode: 400
      });
    }

    if (action === "Check Out") {
      if (existingShift && existingShift.checkOutUtc) {
        await appendAudit(client, {
          actorType: "STUDENT",
          studentId,
          action,
          outcomeCode: RESPONSE_CODES.alreadyCheckedOut,
          message: "You already checked out today.",
          site,
          lat,
          lng,
          metadata: {
            source: "attendance"
          }
        });

        throw new AppError(RESPONSE_CODES.alreadyCheckedOut, "You already checked out today.", {
          statusCode: 400
        });
      }

      if (!existingShift || !existingShift.checkInUtc) {
        await appendAudit(client, {
          actorType: "STUDENT",
          studentId,
          action,
          outcomeCode: RESPONSE_CODES.checkinRequired,
          message: "You must check in first before checking out.",
          site,
          lat,
          lng,
          metadata: {
            source: "attendance"
          }
        });

        throw new AppError(RESPONSE_CODES.checkinRequired, "You must check in first before checking out.", {
          statusCode: 400
        });
      }

      const checkInTime = new Date(existingShift.checkInUtc);
      const elapsedMs = now.getTime() - checkInTime.getTime();
      const minMs = CONFIG.minMinutesBetweenInOut * 60 * 1000;

      if (elapsedMs < minMs) {
        const retryAfterMinutes = Math.ceil((minMs - elapsedMs) / (60 * 1000));

        await appendAudit(client, {
          actorType: "STUDENT",
          studentId,
          action,
          outcomeCode: RESPONSE_CODES.cooldownNotMet,
          message: "You must wait at least 60 minutes between check-in and check-out.",
          site,
          lat,
          lng,
          metadata: {
            source: "attendance",
            retryAfterMinutes
          }
        });

        throw new AppError(RESPONSE_CODES.cooldownNotMet, "You must wait at least 60 minutes between check-in and check-out.", {
          statusCode: 400,
          extra: {
            retryAfterMinutes
          }
        });
      }
    }

    const eventId = crypto.randomUUID();
    const metadata = {
      clientTimestamp: stringify(normalizedPayload.clientTimestamp),
      userAgent: stringify(normalizedPayload.userAgent),
      source: "web"
    };

    await client.query(
      `
      INSERT INTO attendance_events (
        event_id,
        timestamp_utc,
        local_date,
        student_id,
        student_name,
        action,
        site,
        lat,
        lng,
        metadata,
        source
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11
      )
      `,
      [
        eventId,
        now.toISOString(),
        localDate,
        studentId,
        studentName,
        action,
        site,
        Number.isFinite(lat) ? lat : null,
        Number.isFinite(lng) ? lng : null,
        JSON.stringify(metadata),
        "web"
      ]
    );

    const updatedShift = buildLiveShiftRecord(existingShift, {
      action,
      now,
      localDate,
      studentId,
      studentName,
      site,
      source: "web"
    });

    await upsertShift(client, updatedShift);
    const pointTotals = await upsertPointsForStudent(client, studentRow, studentId, studentName);

    await appendAudit(client, {
      actorType: "STUDENT",
      studentId,
      action,
      outcomeCode: RESPONSE_CODES.recorded,
      message: `${action} accepted.`,
      site,
      lat: Number.isFinite(lat) ? lat : "",
      lng: Number.isFinite(lng) ? lng : "",
      metadata: {
        source: "attendance",
        eventId
      }
    });

    const pointsDelta = localDate >= CONFIG.goLiveDate ? CONFIG.pointsPerAction : 0;

    responsePayload = {
      ok: true,
      code: RESPONSE_CODES.recorded,
      pointsDelta,
      totalPoints: pointTotals.totalPoints,
      localDate,
      action
    };
  });

  const dashboardResponse = await fetchStudentDashboard({ studentId, range: "week" });
  return {
    ...responsePayload,
    dashboard: dashboardResponse.data
  };
}

async function adminLogin(password) {
  await ensureDatabaseReady();

  return withTransaction(async (client) => {
    const rawPassword = stringify(password);

    if (!rawPassword) {
      await appendAudit(client, {
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

      throw new AppError(RESPONSE_CODES.missingField, "Missing required field: password", {
        statusCode: 400
      });
    }

    if (!isValidAdminPassword(rawPassword)) {
      await appendAudit(client, {
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

      throw new AppError(RESPONSE_CODES.invalidCredentials, "Incorrect password.", {
        statusCode: 401
      });
    }

    const session = await createAdminSession(client);

    await appendAudit(client, {
      actorType: "ADMIN",
      studentId: "",
      action: "LOGIN",
      outcomeCode: RESPONSE_CODES.recorded,
      message: "Admin login succeeded.",
      site: "",
      lat: "",
      lng: "",
      metadata: {
        source: "admin_auth",
        expiresAt: session.expiresAt
      }
    });

    return {
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt
    };
  });
}

async function fetchStudentDashboard({ studentId, range = "week" }) {
  await ensureDatabaseReady();

  const normalizedStudentId = normalizeStudentId(studentId);
  if (!normalizedStudentId) {
    throw new AppError(RESPONSE_CODES.missingField, "Missing required field: studentId", {
      statusCode: 400
    });
  }

  const normalizedRange = normalizeRange(range);

  return withClient(async (client) => {
    const state = await loadStateForAnalytics(client);
    if (!state.studentDirectory[normalizedStudentId]) {
      throw new AppError(RESPONSE_CODES.unknownStudent, "Student ID is not recognized.", {
        statusCode: 400
      });
    }

    return {
      ok: true,
      data: buildStudentDashboardPayload({
        studentId: normalizedStudentId,
        range: normalizedRange,
        shifts: state.shifts,
        studentDirectory: state.studentDirectory
      }),
      meta: {
        source: "neondb"
      }
    };
  });
}

async function fetchAdminDashboard({ token, range = "overall", site = "all" }) {
  await ensureDatabaseReady();

  const normalizedRange = normalizeRange(range);
  const normalizedSite = normalizeSite(site);

  return withClient(async (client) => {
    await requireAdminToken(client, token);
    const state = await loadStateForAnalytics(client);

    const payload = buildAdminDashboardPayload({
      range: normalizedRange,
      site: normalizedSite,
      shifts: state.shifts,
      studentDirectory: state.studentDirectory,
      auditTrail: state.auditTrail
    });

    payload.source = "neondb";
    payload.dataQuality = "ok";
    payload.diagnostics = {};

    return {
      ok: true,
      data: payload,
      meta: {
        source: "neondb",
        dataQuality: "ok",
        fallbackUsed: false,
        diagnostics: {}
      }
    };
  });
}

async function fetchReportData({ token, type, range = "overall", site = "all", studentId = "" }) {
  await ensureDatabaseReady();

  const normalizedType = stringify(type).toLowerCase();
  if (normalizedType !== "student" && normalizedType !== "cohort") {
    throw new AppError(RESPONSE_CODES.invalidPayload, "Report type must be student or cohort.", {
      statusCode: 400
    });
  }

  const normalizedRange = normalizeRange(range);
  const normalizedSite = normalizeSite(site);

  return withClient(async (client) => {
    await requireAdminToken(client, token);
    const state = await loadStateForAnalytics(client);

    if (normalizedType === "student" && !normalizeStudentId(studentId)) {
      throw new AppError(RESPONSE_CODES.missingField, "Student report requires studentId.", {
        statusCode: 400
      });
    }

    return {
      ok: true,
      data: buildReportPayload({
        type: normalizedType,
        range: normalizedRange,
        site: normalizedSite,
        studentId: normalizeStudentId(studentId),
        shifts: state.shifts,
        studentDirectory: state.studentDirectory,
        auditTrail: state.auditTrail
      })
    };
  });
}

async function fetchRoster() {
  await ensureDatabaseReady();

  return withClient(async (client) => {
    const roster = await getActiveRosterMap(client);
    return {
      ok: true,
      data: roster
    };
  });
}

async function fetchLogs({ token }) {
  await ensureDatabaseReady();

  return withClient(async (client) => {
    await requireAdminToken(client, token);
    return {
      ok: true,
      data: await listLogs(client)
    };
  });
}

async function fetchPoints({ token }) {
  await ensureDatabaseReady();

  return withClient(async (client) => {
    await requireAdminToken(client, token);
    return {
      ok: true,
      data: await listPoints(client)
    };
  });
}

module.exports = {
  submitAttendance,
  adminLogin,
  fetchStudentDashboard,
  fetchAdminDashboard,
  fetchReportData,
  fetchRoster,
  fetchLogs,
  fetchPoints,
  normalizeRange,
  normalizeSite
};
