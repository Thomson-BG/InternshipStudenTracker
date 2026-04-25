const postgres = require("postgres");
const { CONFIG } = require("./config");
const {
  coerceNumber,
  formatLocalDate,
  normalizeLocalDateCell,
  normalizeStudentId,
  normalizeUtcTimestampCell,
  parseJsonSafe,
  roundTo,
  stringify
} = require("./utils");
const { buildStudentDirectory, getAllSites } = require("./analytics");

let sqlClient = null;

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
}

function getSql() {
  if (sqlClient) {
    return sqlClient;
  }

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  sqlClient = postgres(databaseUrl, {
    ssl: "require",
    max: 5,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 30,
    onnotice: () => {}
  });

  return sqlClient;
}

async function closeSql() {
  if (sqlClient) {
    const client = sqlClient;
    sqlClient = null;
    await client.end({ timeout: 5 });
  }
}

async function initSchema(sql = getSql()) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS roster (
      student_id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS logs (
      event_id TEXT PRIMARY KEY,
      timestamp_utc TIMESTAMPTZ NOT NULL,
      local_date DATE NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      action TEXT NOT NULL,
      site TEXT NOT NULL,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      source TEXT NOT NULL DEFAULT 'web',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_logs_student_date ON logs (student_id, local_date);
    CREATE INDEX IF NOT EXISTS idx_logs_local_date ON logs (local_date);
    CREATE INDEX IF NOT EXISTS idx_logs_student_date_action_time ON logs (student_id, local_date, action, timestamp_utc DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_action_date ON logs (action, local_date, timestamp_utc DESC);

    CREATE TABLE IF NOT EXISTS shifts (
      shift_id TEXT PRIMARY KEY,
      local_date DATE NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      site TEXT NOT NULL,
      check_in_utc TIMESTAMPTZ,
      check_out_utc TIMESTAMPTZ,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      hours_decimal NUMERIC(10,2) NOT NULL DEFAULT 0,
      check_in_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      check_out_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(student_id, local_date)
    );

    CREATE INDEX IF NOT EXISTS idx_shifts_local_date ON shifts (local_date);
    CREATE INDEX IF NOT EXISTS idx_shifts_student_date ON shifts (student_id, local_date);
    CREATE INDEX IF NOT EXISTS idx_shifts_site_local_date ON shifts (site, local_date DESC);
    CREATE INDEX IF NOT EXISTS idx_shifts_name_local_date ON shifts (student_name, local_date DESC);

    CREATE TABLE IF NOT EXISTS points (
      student_id TEXT PRIMARY KEY,
      student_name TEXT NOT NULL,
      baseline_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      earned_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      total_points NUMERIC(10,2) NOT NULL DEFAULT 0,
      last_updated TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit (
      id BIGSERIAL PRIMARY KEY,
      timestamp_utc TIMESTAMPTZ NOT NULL,
      local_date DATE NOT NULL,
      actor_type TEXT NOT NULL,
      student_id TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome_code TEXT NOT NULL,
      message TEXT NOT NULL,
      site TEXT NOT NULL,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      audit_fingerprint TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_local_date ON audit (local_date);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit (timestamp_utc DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_fingerprint ON audit (audit_fingerprint) WHERE audit_fingerprint IS NOT NULL;

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions (expires_at);

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function mapShiftRow(row) {
  return {
    shiftId: stringify(row.shift_id),
    localDate: normalizeLocalDateCell(row.local_date, CONFIG.timezone),
    studentId: normalizeStudentId(row.student_id),
    studentName: stringify(row.student_name),
    site: stringify(row.site),
    checkInUtc: normalizeUtcTimestampCell(row.check_in_utc),
    checkOutUtc: normalizeUtcTimestampCell(row.check_out_utc),
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

function mapPointRow(row) {
  return {
    studentId: normalizeStudentId(row.student_id),
    studentName: stringify(row.student_name),
    baselinePoints: Number(row.baseline_points || 0),
    earnedPoints: Number(row.earned_points || 0),
    totalPoints: Number(row.total_points || 0),
    lastUpdated: normalizeUtcTimestampCell(row.last_updated)
  };
}

function mapLogRow(row) {
  const timestampUtc = normalizeUtcTimestampCell(row.timestamp_utc);
  return {
    eventId: stringify(row.event_id),
    timestampUtc,
    timestamp: timestampUtc ? new Date(timestampUtc) : new Date(0),
    localDate: normalizeLocalDateCell(row.local_date, CONFIG.timezone),
    studentId: normalizeStudentId(row.student_id),
    studentName: stringify(row.student_name),
    action: stringify(row.action),
    site: stringify(row.site),
    lat: coerceNumber(row.lat),
    lng: coerceNumber(row.lng),
    metadata: parseJsonSafe(row.metadata),
    source: stringify(row.source)
  };
}

function mapAuditRow(row) {
  const timestampUtc = normalizeUtcTimestampCell(row.timestamp_utc);
  return {
    timestampUtc,
    localDate: normalizeLocalDateCell(row.local_date, CONFIG.timezone) || (timestampUtc ? formatLocalDate(new Date(timestampUtc), CONFIG.timezone) : ""),
    actorType: stringify(row.actor_type),
    studentId: normalizeStudentId(row.student_id),
    action: stringify(row.action),
    outcomeCode: stringify(row.outcome_code),
    message: stringify(row.message),
    site: stringify(row.site),
    lat: coerceNumber(row.lat),
    lng: coerceNumber(row.lng),
    metadata: parseJsonSafe(row.metadata)
  };
}

async function listActiveRosterMap(sql = getSql()) {
  const rows = await sql`
    SELECT student_id, student_name
    FROM roster
    WHERE lower(status) <> 'inactive'
    ORDER BY student_name ASC
  `;

  const roster = {};
  rows.forEach((row) => {
    const studentId = normalizeStudentId(row.student_id);
    if (studentId) {
      roster[studentId] = stringify(row.student_name);
    }
  });

  return roster;
}

async function listLogs(sql = getSql()) {
  const rows = await sql`
    SELECT event_id, timestamp_utc, local_date, student_id, student_name, action, site, lat, lng, metadata, source
    FROM logs
    ORDER BY timestamp_utc ASC, event_id ASC
  `;
  return rows.map(mapLogRow);
}

async function listShifts(sql = getSql()) {
  const rows = await sql`
    SELECT shift_id, local_date, student_id, student_name, site, check_in_utc, check_out_utc, duration_minutes,
           hours_decimal, check_in_points, check_out_points, total_points, status, source, notes
    FROM shifts
  `;
  return rows.map(mapShiftRow).filter((row) => row.localDate && row.studentId);
}

async function listPoints(sql = getSql()) {
  const rows = await sql`
    SELECT student_id, student_name, baseline_points, earned_points, total_points, last_updated
    FROM points
    ORDER BY total_points DESC, student_name ASC
  `;
  return rows.map(mapPointRow);
}

async function listAudits(sql = getSql()) {
  const rows = await sql`
    SELECT timestamp_utc, local_date, actor_type, student_id, action, outcome_code, message, site, lat, lng, metadata
    FROM audit
    ORDER BY timestamp_utc DESC, id DESC
  `;

  return rows.map(mapAuditRow).filter((row) => Boolean(row.timestampUtc));
}

async function buildMaterializedState(sql = getSql(), options = {}) {
  const includeLogs = Boolean(options.includeLogs);
  const includeAudits = Boolean(options.includeAudits);
  const includePoints = options.includePoints !== false;

  const [logs, audits, shifts, points, roster] = await Promise.all([
    includeLogs ? listLogs(sql) : Promise.resolve([]),
    includeAudits ? listAudits(sql) : Promise.resolve([]),
    listShifts(sql),
    includePoints ? listPoints(sql) : Promise.resolve([]),
    listActiveRosterMap(sql)
  ]);

  const studentDirectory = buildStudentDirectory({ logs, points, shifts, roster });
  const sites = getAllSites({ shifts, logs });

  return {
    logs,
    audits,
    shifts,
    points,
    studentDirectory,
    sites
  };
}

async function cleanupExpiredSessions(sql = getSql()) {
  await sql`DELETE FROM admin_sessions WHERE expires_at <= NOW()`;
}

async function requireAdminToken(sql = getSql(), token) {
  await cleanupExpiredSessions(sql);
  const normalizedToken = stringify(token);
  if (!normalizedToken) {
    return { ok: false, message: "Admin token required." };
  }

  const rows = await sql`
    SELECT token
    FROM admin_sessions
    WHERE token = ${normalizedToken}
      AND expires_at > NOW()
    LIMIT 1
  `;

  if (!rows.length) {
    return { ok: false, message: "Admin session is missing or expired." };
  }

  return { ok: true };
}

async function createAdminSession(sql = getSql(), token, expiresAt) {
  await sql`
    INSERT INTO admin_sessions (token, expires_at)
    VALUES (${token}, ${expiresAt})
    ON CONFLICT (token)
    DO UPDATE SET expires_at = EXCLUDED.expires_at
  `;
}

async function getConfig(sql, key) {
  const rows = await sql`SELECT value FROM config WHERE key = ${key} LIMIT 1`;
  return rows[0]?.value ?? null;
}

async function setConfig(sql, key, value) {
  await sql`
    INSERT INTO config (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

async function appendAudit(sql = getSql(), entry) {
  const nowIso = new Date().toISOString();
  const localDate = formatLocalDate(new Date(), CONFIG.timezone);

  await sql`
    INSERT INTO audit (
      timestamp_utc, local_date, actor_type, student_id, action,
      outcome_code, message, site, lat, lng, metadata, audit_fingerprint
    ) VALUES (
      ${nowIso},
      ${localDate},
      ${stringify(entry.actorType)},
      ${stringify(entry.studentId)},
      ${stringify(entry.action)},
      ${stringify(entry.outcomeCode)},
      ${stringify(entry.message)},
      ${stringify(entry.site)},
      ${coerceNumber(entry.lat) === "" ? null : Number(entry.lat)},
      ${coerceNumber(entry.lng) === "" ? null : Number(entry.lng)},
      ${JSON.stringify(entry.metadata || {})}::jsonb,
      ${null}
    )
  `;
}

async function findRosterStudent(sql = getSql(), studentId) {
  const normalizedId = normalizeStudentId(studentId);
  const rows = await sql`
    SELECT student_id, student_name, status
    FROM roster
    WHERE student_id = ${normalizedId}
    LIMIT 1
  `;

  if (!rows.length) {
    return null;
  }

  const row = rows[0];
  if (String(row.status || "").toLowerCase() === "inactive") {
    return null;
  }

  return {
    studentId: normalizeStudentId(row.student_id),
    studentName: stringify(row.student_name)
  };
}

async function findShiftForDayForUpdate(sql, studentId, localDate) {
  const rows = await sql`
    SELECT shift_id, local_date, student_id, student_name, site, check_in_utc, check_out_utc, duration_minutes,
           hours_decimal, check_in_points, check_out_points, total_points, status, source, notes
    FROM shifts
    WHERE student_id = ${studentId}
      AND local_date = ${localDate}
    FOR UPDATE
  `;

  if (!rows.length) {
    return null;
  }

  return mapShiftRow(rows[0]);
}

async function findShiftById(sql, shiftId) {
  const rows = await sql`
    SELECT shift_id, local_date, student_id, student_name, site, check_in_utc, check_out_utc, duration_minutes,
           hours_decimal, check_in_points, check_out_points, total_points, status, source, notes
    FROM shifts
    WHERE shift_id = ${shiftId}
  `;
  return rows.length ? mapShiftRow(rows[0]) : null;
}

async function deleteShift(sql, shiftId) {
  await sql`DELETE FROM shifts WHERE shift_id = ${shiftId}`;
}

async function listOpenShiftsForDate(sql, localDate) {
  const rows = await sql`
    SELECT shift_id, local_date, student_id, student_name, site, check_in_utc, check_out_utc,
           duration_minutes, hours_decimal, check_in_points, check_out_points, total_points,
           status, source, notes
    FROM shifts
    WHERE local_date = ${localDate}
      AND status = 'OPEN'
  `;
  return rows.map(mapShiftRow);
}

async function upsertShift(sql, shift) {
  await sql`
    INSERT INTO shifts (
      shift_id, local_date, student_id, student_name, site, check_in_utc, check_out_utc,
      duration_minutes, hours_decimal, check_in_points, check_out_points, total_points,
      status, source, notes, updated_at
    ) VALUES (
      ${shift.shiftId},
      ${shift.localDate},
      ${shift.studentId},
      ${shift.studentName},
      ${shift.site},
      ${shift.checkInUtc || null},
      ${shift.checkOutUtc || null},
      ${Number(shift.durationMinutes || 0)},
      ${Number(shift.hoursDecimal || 0)},
      ${Number(shift.checkInPoints || 0)},
      ${Number(shift.checkOutPoints || 0)},
      ${Number(shift.totalPoints || 0)},
      ${shift.status},
      ${shift.source || "web"},
      ${shift.notes || ""},
      NOW()
    )
    ON CONFLICT (shift_id)
    DO UPDATE SET
      local_date = EXCLUDED.local_date,
      student_id = EXCLUDED.student_id,
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
  `;
}

async function insertLog(sql, logEntry) {
  await sql`
    INSERT INTO logs (
      event_id, timestamp_utc, local_date, student_id, student_name, action,
      site, lat, lng, metadata, source
    ) VALUES (
      ${logEntry.eventId},
      ${logEntry.timestampUtc},
      ${logEntry.localDate},
      ${logEntry.studentId},
      ${logEntry.studentName},
      ${logEntry.action},
      ${logEntry.site},
      ${coerceNumber(logEntry.lat) === "" ? null : Number(logEntry.lat)},
      ${coerceNumber(logEntry.lng) === "" ? null : Number(logEntry.lng)},
      ${JSON.stringify(logEntry.metadata || {})}::jsonb,
      ${logEntry.source || "web"}
    )
    ON CONFLICT (event_id) DO NOTHING
  `;
}

async function getBaselinePoints(sql, studentId) {
  const rows = await sql`
    SELECT baseline_points
    FROM points
    WHERE student_id = ${studentId}
    LIMIT 1
  `;
  if (!rows.length) {
    return 0;
  }
  return Number(rows[0].baseline_points || 0);
}

async function sumEarnedPoints(sql, studentId) {
  const rows = await sql`
    SELECT COALESCE(SUM(total_points), 0) AS earned
    FROM shifts
    WHERE student_id = ${studentId}
  `;
  return Number(rows[0]?.earned || 0);
}

async function latestShiftTimestamp(sql, studentId) {
  const rows = await sql`
    SELECT COALESCE(
      MAX(COALESCE(check_out_utc, check_in_utc)),
      NULL
    ) AS last_updated
    FROM shifts
    WHERE student_id = ${studentId}
  `;
  return normalizeUtcTimestampCell(rows[0]?.last_updated || "");
}

async function upsertPointsForStudent(sql, studentId, studentName) {
  const baselinePoints = await getBaselinePoints(sql, studentId);
  const earnedPoints = roundTo(await sumEarnedPoints(sql, studentId), 2);
  const totalPoints = roundTo(baselinePoints + earnedPoints, 2);
  const lastUpdated = await latestShiftTimestamp(sql, studentId);

  await sql`
    INSERT INTO points (
      student_id, student_name, baseline_points, earned_points, total_points, last_updated, updated_at
    ) VALUES (
      ${studentId},
      ${studentName},
      ${baselinePoints},
      ${earnedPoints},
      ${totalPoints},
      ${lastUpdated || null},
      NOW()
    )
    ON CONFLICT (student_id)
    DO UPDATE SET
      student_name = EXCLUDED.student_name,
      baseline_points = COALESCE(points.baseline_points, EXCLUDED.baseline_points),
      earned_points = EXCLUDED.earned_points,
      total_points = EXCLUDED.total_points,
      last_updated = EXCLUDED.last_updated,
      updated_at = NOW()
  `;

  return {
    baselinePoints,
    earnedPoints,
    totalPoints,
    lastUpdated
  };
}

module.exports = {
  appendAudit,
  getConfig,
  setConfig,
  buildMaterializedState,
  cleanupExpiredSessions,
  closeSql,
  createAdminSession,
  deleteShift,
  findRosterStudent,
  findShiftById,
  findShiftForDayForUpdate,
  listOpenShiftsForDate,
  getSql,
  initSchema,
  insertLog,
  listActiveRosterMap,
  listAudits,
  listLogs,
  listPoints,
  listShifts,
  requireAdminToken,
  upsertPointsForStudent,
  upsertShift
};
