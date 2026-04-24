const crypto = require("node:crypto");
const { CONFIG, RESPONSE_CODES } = require("./_lib/config");
const {
  buildStudentRecordsPayload,
  getAdminDashboardPayload,
  getReportPayload,
  getStudentDashboardPayload,
  normalizeRange,
  normalizeSite
} = require("./_lib/analytics");
const {
  appendAudit,
  buildMaterializedState,
  createAdminSession,
  deleteShift,
  findRosterStudent,
  findShiftById,
  findShiftForDayForUpdate,
  getSql,
  initSchema,
  insertLog,
  listActiveRosterMap,
  listLogs,
  listPoints,
  requireAdminToken,
  upsertPointsForStudent,
  upsertShift
} = require("./_lib/db");
const { coerceNumber, formatLocalDate, normalizeLocalDateCell, normalizeStudentId, sha256Hex, stringify } = require("./_lib/utils");

let schemaInitPromise = null;

function applyCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

async function ensureSchema(sql) {
  if (!schemaInitPromise) {
    schemaInitPromise = initSchema(sql).catch((error) => {
      schemaInitPromise = null;
      throw error;
    });
  }
  await schemaInitPromise;
}

function jsonResponse(res, payload, status = 200) {
  applyCorsHeaders(res);
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8").send(JSON.stringify(payload));
}

function errorPayload(code, message, extra = {}) {
  return {
    ok: false,
    code,
    message,
    ...extra
  };
}

function normalizeMode(mode) {
  return stringify(mode).toLowerCase() || "student_dashboard";
}

function parseMode(req) {
  return normalizeMode(getQueryValue(req.query?.mode));
}

function getQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getAdminPasswordHash() {
  const explicitHash = stringify(process.env.ADMIN_PASSWORD_HASH);
  if (explicitHash) {
    return explicitHash;
  }

  const rawPassword = stringify(process.env.ADMIN_PASSWORD);
  if (rawPassword) {
    return sha256Hex(rawPassword);
  }

  return CONFIG.defaultAdminPasswordHash;
}

function validateAttendancePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      code: RESPONSE_CODES.invalidPayload,
      message: "Request body is invalid."
    };
  }

  const requiredFields = ["studentId", "studentName", "action", "site", "lat", "lng"];
  for (const field of requiredFields) {
    const value = payload[field];
    if (value === null || value === undefined || stringify(value) === "") {
      return {
        code: RESPONSE_CODES.missingField,
        message: `Missing required field: ${field}`
      };
    }
  }

  const action = stringify(payload.action);
  if (action !== "Check In" && action !== "Check Out") {
    return {
      code: RESPONSE_CODES.invalidAction,
      message: "Action must be Check In or Check Out."
    };
  }

  return null;
}

function buildStudentAuditFromPayload(payload, code, message, extra) {
  const safePayload = payload || {};
  return {
    actorType: "STUDENT",
    studentId: stringify(safePayload.studentId),
    action: stringify(safePayload.action) || "ATTENDANCE_SUBMIT",
    outcomeCode: code,
    message,
    site: stringify(safePayload.site),
    lat: safePayload.lat,
    lng: safePayload.lng,
    metadata: {
      clientTimestamp: stringify(safePayload.clientTimestamp),
      userAgent: stringify(safePayload.userAgent),
      extra: extra || {}
    }
  };
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
  nextShift.hoursDecimal = Math.round((durationMinutes / 60) * 100) / 100;
  nextShift.checkOutPoints = eligibleForPoints ? CONFIG.pointsPerAction : 0;
  nextShift.totalPoints = Number(nextShift.checkInPoints || 0) + Number(nextShift.checkOutPoints || 0);
  nextShift.status = eligibleForPoints ? "COMPLETE" : "BACKFILLED_COMPLETE";

  return nextShift;
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") {
      return req.body;
    }
    if (Buffer.isBuffer(req.body)) {
      return req.body.toString("utf8");
    }
    if (typeof req.body === "object") {
      return JSON.stringify(req.body);
    }
  }

  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) {
    throw new Error("Missing request body.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

async function handleAdminAuth(req, res, sql) {
  try {
    const payload = await parseJsonBody(req);
    const password = stringify(payload.password);

    if (!password) {
      await appendAudit(sql, {
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
      return jsonResponse(res, errorPayload(RESPONSE_CODES.missingField, "Missing required field: password"));
    }

    const expectedHash = getAdminPasswordHash();
    const providedHash = sha256Hex(password);
    if (providedHash !== expectedHash) {
      await appendAudit(sql, {
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
      return jsonResponse(res, errorPayload(RESPONSE_CODES.invalidCredentials, "Incorrect password."));
    }

    const token = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + CONFIG.adminSessionHours * 60 * 60 * 1000).toISOString();
    await createAdminSession(sql, token, expiresAt);

    await appendAudit(sql, {
      actorType: "ADMIN",
      studentId: "",
      action: "LOGIN",
      outcomeCode: RESPONSE_CODES.recorded,
      message: "Admin login succeeded.",
      site: "",
      lat: "",
      lng: "",
      metadata: { source: "admin_auth", expiresAt }
    });

    return jsonResponse(res, {
      ok: true,
      token,
      expiresAt
    });
  } catch (error) {
    await appendAudit(sql, {
      actorType: "ADMIN",
      studentId: "",
      action: "LOGIN",
      outcomeCode: RESPONSE_CODES.serverError,
      message: error.message,
      site: "",
      lat: "",
      lng: "",
      metadata: { source: "admin_auth" }
    });
    return jsonResponse(res, errorPayload(RESPONSE_CODES.serverError, error.message));
  }
}

async function handleAttendancePost(req, res, sql) {
  let payload = null;

  try {
    payload = await parseJsonBody(req);
    const validationError = validateAttendancePayload(payload);

    if (validationError) {
      await appendAudit(sql, buildStudentAuditFromPayload(payload, validationError.code, validationError.message));
      return jsonResponse(res, errorPayload(validationError.code, validationError.message));
    }

    const action = stringify(payload.action);
    const rawStudentId = stringify(payload.studentId);
    const studentId = normalizeStudentId(rawStudentId);
    const now = new Date();
    const localDate = formatLocalDate(now, CONFIG.timezone);

    const txResult = await sql.begin(async (tx) => {
      const rosterStudent = await findRosterStudent(tx, studentId);
      if (!rosterStudent) {
        const unknownError = {
          code: RESPONSE_CODES.unknownStudent,
          message: "Student ID is not recognized."
        };
        await appendAudit(tx, buildStudentAuditFromPayload(payload, unknownError.code, unknownError.message));
        return { error: unknownError };
      }

      const studentName = rosterStudent.studentName || stringify(payload.studentName) || studentId;
      const existingShift = await findShiftForDayForUpdate(tx, studentId, localDate);

      if (action === "Check In" && existingShift && existingShift.checkInUtc) {
        const err = {
          code: RESPONSE_CODES.alreadyCheckedIn,
          message: "You already checked in today."
        };
        await appendAudit(tx, buildStudentAuditFromPayload(payload, err.code, err.message));
        return { error: err };
      }

      if (action === "Check Out") {
        if (existingShift && existingShift.checkOutUtc) {
          const err = {
            code: RESPONSE_CODES.alreadyCheckedOut,
            message: "You already checked out today."
          };
          await appendAudit(tx, buildStudentAuditFromPayload(payload, err.code, err.message));
          return { error: err };
        }

        if (!existingShift || !existingShift.checkInUtc) {
          const err = {
            code: RESPONSE_CODES.checkinRequired,
            message: "You must check in first before checking out."
          };
          await appendAudit(tx, buildStudentAuditFromPayload(payload, err.code, err.message));
          return { error: err };
        }

        const checkInTime = new Date(existingShift.checkInUtc);
        const elapsedMs = now.getTime() - checkInTime.getTime();
        const minMs = CONFIG.minMinutesBetweenInOut * 60 * 1000;
        if (elapsedMs < minMs) {
          const retryAfterMinutes = Math.ceil((minMs - elapsedMs) / (60 * 1000));
          const err = {
            code: RESPONSE_CODES.cooldownNotMet,
            message: "You must wait at least 60 minutes between check-in and check-out.",
            extra: { retryAfterMinutes }
          };
          await appendAudit(tx, buildStudentAuditFromPayload(payload, err.code, err.message, err.extra));
          return { error: err };
        }
      }

      const eventId = crypto.randomUUID();
      const source = "web";
      const metadata = {
        clientTimestamp: stringify(payload.clientTimestamp),
        userAgent: stringify(payload.userAgent),
        source
      };

      await insertLog(tx, {
        eventId,
        timestampUtc: now.toISOString(),
        localDate,
        studentId,
        studentName,
        action,
        site: stringify(payload.site),
        lat: coerceNumber(payload.lat),
        lng: coerceNumber(payload.lng),
        metadata,
        source
      });

      const updatedShift = buildLiveShiftRecord(existingShift, {
        action,
        now,
        localDate,
        studentId,
        studentName,
        site: stringify(payload.site),
        source
      });
      await upsertShift(tx, updatedShift);

      const updatedPoint = await upsertPointsForStudent(tx, studentId, studentName);
      const state = await buildMaterializedState(tx, { includePoints: true });
      const dashboard = getStudentDashboardPayload(state, studentId, "week");

      const pointsDelta = localDate >= CONFIG.goLiveDate ? CONFIG.pointsPerAction : 0;
      return {
        ok: true,
        code: RESPONSE_CODES.recorded,
        pointsDelta,
        totalPoints: updatedPoint.totalPoints,
        localDate,
        action,
        dashboard
      };
    });

    if (txResult.error) {
      return jsonResponse(res, errorPayload(txResult.error.code, txResult.error.message, txResult.error.extra || {}));
    }

    return jsonResponse(res, txResult);
  } catch (error) {
    try {
      await appendAudit(sql, {
        actorType: "STUDENT",
        studentId: stringify(payload?.studentId),
        action: stringify(payload?.action) || "ATTENDANCE_SUBMIT",
        outcomeCode: RESPONSE_CODES.serverError,
        message: error.message,
        site: stringify(payload?.site),
        lat: payload?.lat,
        lng: payload?.lng,
        metadata: { source: "attendance" }
      });
    } catch {
      // Ignore audit write failures on terminal errors.
    }
    return jsonResponse(res, errorPayload(RESPONSE_CODES.serverError, error.message));
  }
}

async function handleGet(req, res, sql) {
  const mode = parseMode(req);

  const tokenModes = {
    admin_dashboard: true,
    report_data: true,
    student_records: true,
    logs: true,
    points: true
  };

  if (tokenModes[mode]) {
    const token = getQueryValue(req.query?.token);
    const auth = await requireAdminToken(sql, token);
    if (!auth.ok) {
      return jsonResponse(res, errorPayload(RESPONSE_CODES.authRequired, auth.message));
    }
  }

  if (mode === "logs") {
    const logs = await listLogs(sql);
    return jsonResponse(res, { ok: true, data: logs });
  }

  if (mode === "points") {
    const points = await listPoints(sql);
    return jsonResponse(res, { ok: true, data: points });
  }

  if (mode === "student_dashboard") {
    const studentId = normalizeStudentId(getQueryValue(req.query?.studentId));
    const range = normalizeRange(getQueryValue(req.query?.range));
    if (!studentId) {
      return jsonResponse(res, errorPayload(RESPONSE_CODES.missingField, "Missing required field: studentId"));
    }

    const state = await buildMaterializedState(sql, { includePoints: true });
    const dashboard = getStudentDashboardPayload(state, studentId, range);
    return jsonResponse(res, { ok: true, data: dashboard });
  }

  if (mode === "admin_dashboard") {
    const range = normalizeRange(getQueryValue(req.query?.range));
    const site = normalizeSite(getQueryValue(req.query?.site));
    const state = await buildMaterializedState(sql, { includeAudits: true });
    const payload = getAdminDashboardPayload(state, range, site);
    return jsonResponse(res, { ok: true, data: payload });
  }

  if (mode === "student_records") {
    const range = normalizeRange(getQueryValue(req.query?.range));
    const site = normalizeSite(getQueryValue(req.query?.site));
    const startDate = normalizeLocalDateCell(getQueryValue(req.query?.startDate));
    const endDate = normalizeLocalDateCell(getQueryValue(req.query?.endDate));
    const query = stringify(getQueryValue(req.query?.query));
    const locationMode = stringify(getQueryValue(req.query?.locationMode));
    const page = Number(getQueryValue(req.query?.page) || 1);
    const pageSize = Number(getQueryValue(req.query?.pageSize) || 12);
    const state = await buildMaterializedState(sql, { includeLogs: true, includePoints: false });
    const payload = buildStudentRecordsPayload(state, {
      range,
      site,
      startDate,
      endDate,
      query,
      locationMode,
      page,
      pageSize
    });
    return jsonResponse(res, { ok: true, data: payload });
  }

  if (mode === "report_data") {
    const type = stringify(getQueryValue(req.query?.type)).toLowerCase();
    const range = normalizeRange(getQueryValue(req.query?.range));
    const site = normalizeSite(getQueryValue(req.query?.site));
    const studentId = normalizeStudentId(getQueryValue(req.query?.studentId));

    const state = await buildMaterializedState(sql, {
      includeAudits: type === "cohort",
      includePoints: type === "student"
    });
    const payload = getReportPayload(state, type, range, site, studentId);
    return jsonResponse(res, { ok: true, data: payload });
  }

  if (mode === "get_roster") {
    const roster = await listActiveRosterMap(sql);
    return jsonResponse(res, { ok: true, data: roster });
  }

  return jsonResponse(res, errorPayload(RESPONSE_CODES.invalidMode, `Unsupported mode: ${mode}`));
}

async function handleAdminDeleteShift(req, res, sql) {
  const body = await parseJsonBody(req);
  const token = stringify(body.token);
  const shiftId = stringify(body.shiftId).trim();
  const studentId = normalizeStudentId(stringify(body.studentId));

  await requireAdminToken(sql, token);
  if (!shiftId || !studentId) {
    return jsonResponse(res, errorPayload(RESPONSE_CODES.missingField, "shiftId and studentId are required."));
  }

  const txResult = await sql.begin(async (tx) => {
    const existing = await findShiftById(tx, shiftId);
    if (!existing || existing.studentId !== studentId) {
      return { error: { code: RESPONSE_CODES.invalidPayload, message: "Shift not found for this student." } };
    }
    await deleteShift(tx, shiftId);
    await upsertPointsForStudent(tx, studentId, existing.studentName);
    await appendAudit(tx, {
      actorType: "ADMIN",
      studentId,
      action: "Admin Delete Shift",
      outcomeCode: "SHIFT_DELETED",
      message: `Deleted shift ${shiftId} (${existing.localDate}, ${existing.site}).`,
      site: existing.site,
      metadata: { shiftId }
    });
    return { ok: true };
  });

  if (txResult.error) {
    return jsonResponse(res, errorPayload(txResult.error.code, txResult.error.message));
  }
  return jsonResponse(res, { ok: true });
}

async function handleAdminEditShift(req, res, sql) {
  const body = await parseJsonBody(req);
  const token = stringify(body.token);
  const shiftId = stringify(body.shiftId).trim();
  const studentId = normalizeStudentId(stringify(body.studentId));
  const checkInUtc = stringify(body.checkInUtc).trim();
  const checkOutUtc = stringify(body.checkOutUtc || "").trim();
  const failedToCheckout = Boolean(body.failedToCheckout);

  await requireAdminToken(sql, token);

  if (!shiftId || !studentId || !checkInUtc) {
    return jsonResponse(res, errorPayload(RESPONSE_CODES.missingField, "shiftId, studentId, and checkInUtc are required."));
  }

  const checkInDate = new Date(checkInUtc);
  if (isNaN(checkInDate.getTime())) {
    return jsonResponse(res, errorPayload(RESPONSE_CODES.invalidPayload, "Invalid checkInUtc timestamp."));
  }

  let checkOutDate = null;
  if (checkOutUtc) {
    checkOutDate = new Date(checkOutUtc);
    if (isNaN(checkOutDate.getTime())) {
      return jsonResponse(res, errorPayload(RESPONSE_CODES.invalidPayload, "Invalid checkOutUtc timestamp."));
    }
    if (checkOutDate.getTime() <= checkInDate.getTime()) {
      return jsonResponse(res, errorPayload(RESPONSE_CODES.invalidPayload, "Check-out must be after check-in."));
    }
    if (!failedToCheckout) {
      const diffMinutes = (checkOutDate.getTime() - checkInDate.getTime()) / 60000;
      if (diffMinutes < CONFIG.minMinutesBetweenInOut) {
        return jsonResponse(res, errorPayload(RESPONSE_CODES.cooldownNotMet,
          `Minimum ${CONFIG.minMinutesBetweenInOut} minutes required between check-in and check-out.`));
      }
    }
  }

  const txResult = await sql.begin(async (tx) => {
    const existing = await findShiftById(tx, shiftId);
    if (!existing || existing.studentId !== studentId) {
      return { error: { code: RESPONSE_CODES.invalidPayload, message: "Shift not found for this student." } };
    }

    const localDate = existing.localDate;
    const eligibleForPoints = localDate >= CONFIG.goLiveDate;
    const checkInPoints = eligibleForPoints ? CONFIG.pointsPerAction : 0;

    let checkOutPoints = 0;
    let durationMinutes = 0;
    let hoursDecimal = 0;
    let status = "OPEN";

    if (checkOutDate) {
      durationMinutes = Math.max(0, Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 60000));
      hoursDecimal = Math.round((durationMinutes / 60) * 100) / 100;
      if (failedToCheckout) {
        checkOutPoints = 0;
        status = "FAILED_TO_CHECKOUT";
      } else {
        checkOutPoints = eligibleForPoints ? CONFIG.pointsPerAction : 0;
        status = eligibleForPoints ? "COMPLETE" : "BACKFILLED_COMPLETE";
      }
    }

    const updatedShift = {
      ...existing,
      checkInUtc,
      checkOutUtc: checkOutUtc || "",
      durationMinutes,
      hoursDecimal,
      checkInPoints,
      checkOutPoints,
      totalPoints: checkInPoints + checkOutPoints,
      status,
      source: "admin"
    };

    await upsertShift(tx, updatedShift);
    await upsertPointsForStudent(tx, studentId, existing.studentName);
    await appendAudit(tx, {
      actorType: "ADMIN",
      studentId,
      action: "Admin Edit Shift",
      outcomeCode: "SHIFT_EDITED",
      message: `Shift ${shiftId}: check-in=${checkInUtc}, check-out=${checkOutUtc || "N/A"}`,
      site: existing.site,
      metadata: { shiftId, checkInUtc, checkOutUtc }
    });

    return { ok: true, shift: updatedShift };
  });

  if (txResult.error) {
    return jsonResponse(res, errorPayload(txResult.error.code, txResult.error.message));
  }
  return jsonResponse(res, { ok: true, data: txResult.shift });
}

module.exports = async function handler(req, res) {
  try {
    applyCorsHeaders(res);
    const sql = getSql();
    await ensureSchema(sql);

    const method = String(req.method || "GET").toUpperCase();
    if (method === "OPTIONS") {
      return res.status(204).end();
    }

    if (method === "GET") {
      return await handleGet(req, res, sql);
    }

    if (method === "POST") {
      const mode = parseMode(req);
      if (mode === "admin_auth") {
        return await handleAdminAuth(req, res, sql);
      }
      if (mode === "admin_edit_shift") {
        return await handleAdminEditShift(req, res, sql);
      }
      if (mode === "admin_delete_shift") {
        return await handleAdminDeleteShift(req, res, sql);
      }
      return await handleAttendancePost(req, res, sql);
    }

    return jsonResponse(res, errorPayload(RESPONSE_CODES.invalidMode, `Unsupported method: ${method}`), 405);
  } catch (error) {
    return jsonResponse(res, errorPayload(RESPONSE_CODES.serverError, error.message), 200);
  }
};
