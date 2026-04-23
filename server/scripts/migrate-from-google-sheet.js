#!/usr/bin/env node

const crypto = require("crypto");
const { getPool } = require("../lib/db");
const { ensureDatabaseReady } = require("../lib/schema");

const DEFAULT_SHEET_ID = "1Dd4qJ3SkARcigi-kmM9wCUc9NkRqpQoEkFVri7_FKlY";
const SHEETS = ["Logs", "Shifts", "Points", "Audit", "Roster"];

const sheetId = String(process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID).trim();
const truncateFirst = String(process.env.MIGRATE_TRUNCATE || "true").toLowerCase() !== "false";

if (!sheetId) {
  console.error("Missing GOOGLE_SHEET_ID.");
  process.exit(1);
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseCsv(text) {
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

function buildIndex(headers) {
  const index = {};
  headers.forEach((header, columnIndex) => {
    index[normalizeHeader(header)] = columnIndex;
  });
  return index;
}

function getCell(row, index, key, fallbackIndex = -1) {
  if (Object.prototype.hasOwnProperty.call(index, key)) {
    return row[index[key]];
  }
  return fallbackIndex >= 0 ? row[fallbackIndex] : "";
}

function normalizeStudentId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.padStart(6, "0") : "";
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDateLike(value) {
  if (!value) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime());
}

function toIso(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function safeJson(value) {
  if (!value) {
    return {};
  }
  const text = String(value).trim();
  if (!text) {
    return {};
  }
  if (text.startsWith("{")) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return { raw: text };
    }
  }
  return { raw: text };
}

function hashEventId(input) {
  return crypto.createHash("sha256").update(String(input), "utf8").digest("hex").slice(0, 32);
}

function parseLogs(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildIndex(headers);

  return records.map((row, rowIndex) => {
    const timestamp = getCell(row, index, "timestamputc", 0);
    const studentId = normalizeStudentId(getCell(row, index, "studentid", 1));
    const studentName = String(getCell(row, index, "studentname", 2) || "").trim();
    const action = String(getCell(row, index, "action", 3) || "").trim();
    const site = String(getCell(row, index, "site", 4) || "").trim();
    const lat = getCell(row, index, "lat", 5);
    const lng = getCell(row, index, "lng", 6);
    const localDate = String(getCell(row, index, "localdate", 7) || "").trim();
    const metadata = safeJson(getCell(row, index, "metadata", 8));
    const eventId = String(getCell(row, index, "eventid", 9) || "").trim();
    const source = String(getCell(row, index, "source", 10) || "legacy").trim() || "legacy";

    const iso = toIso(timestamp);
    if (!iso || !studentId || !action) {
      return null;
    }

    return {
      eventId: eventId || hashEventId(`${studentId}-${iso}-${action}-${rowIndex}`),
      timestampUtc: iso,
      localDate: localDate || iso.slice(0, 10),
      studentId,
      studentName: studentName || studentId,
      action,
      site,
      lat: toNullableNumber(lat),
      lng: toNullableNumber(lng),
      metadata,
      source
    };
  }).filter(Boolean);
}

function parseShifts(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildIndex(headers);

  return records.map((row) => {
    const localDate = String(getCell(row, index, "localdate", 1) || "").trim();
    const studentId = normalizeStudentId(getCell(row, index, "studentid", 2));
    if (!localDate || !studentId) {
      return null;
    }

    return {
      shiftId: String(getCell(row, index, "shiftid", 0) || `${studentId}-${localDate}`).trim(),
      localDate,
      studentId,
      studentName: String(getCell(row, index, "studentname", 3) || studentId).trim(),
      site: String(getCell(row, index, "site", 4) || "").trim(),
      checkInUtc: toIso(getCell(row, index, "checkinutc", 5)),
      checkOutUtc: toIso(getCell(row, index, "checkoututc", 6)),
      durationMinutes: Math.round(toNumber(getCell(row, index, "durationminutes", 7))),
      hoursDecimal: toNumber(getCell(row, index, "hoursdecimal", 8)),
      checkInPoints: Math.round(toNumber(getCell(row, index, "checkinpoints", 9))),
      checkOutPoints: Math.round(toNumber(getCell(row, index, "checkoutpoints", 10))),
      totalPoints: Math.round(toNumber(getCell(row, index, "totalpoints", 11))),
      status: String(getCell(row, index, "status", 12) || "NOT_STARTED").trim(),
      source: String(getCell(row, index, "source", 13) || "legacy").trim(),
      notes: String(getCell(row, index, "notes", 14) || "").trim()
    };
  }).filter(Boolean);
}

function parsePoints(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildIndex(headers);

  return records.map((row) => {
    const studentId = normalizeStudentId(getCell(row, index, "studentid", 0));
    if (!studentId) {
      return null;
    }

    const rawLast = getCell(row, index, "lastupdated", 5);
    const lastUpdated = isDateLike(rawLast) ? toIso(rawLast) : null;

    return {
      studentId,
      studentName: String(getCell(row, index, "studentname", 1) || studentId).trim(),
      baselinePoints: toNumber(getCell(row, index, "baselinepoints", 2)),
      earnedPoints: toNumber(getCell(row, index, "earnedpoints", 3)),
      totalPoints: toNumber(getCell(row, index, "totalpoints", 4)),
      lastUpdated
    };
  }).filter(Boolean);
}

function parseAudit(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildIndex(headers);

  return records.map((row) => {
    const timestamp = toIso(getCell(row, index, "timestamputc", 0));
    if (!timestamp) {
      return null;
    }

    const localDate = String(getCell(row, index, "localdate", 1) || timestamp.slice(0, 10)).trim();

    return {
      timestampUtc: timestamp,
      localDate,
      actorType: String(getCell(row, index, "actortype", 2) || "STUDENT").trim(),
      studentId: normalizeStudentId(getCell(row, index, "studentid", 3)),
      action: String(getCell(row, index, "action", 4) || "").trim(),
      outcomeCode: String(getCell(row, index, "outcomecode", 5) || "").trim(),
      message: String(getCell(row, index, "message", 6) || "").trim(),
      site: String(getCell(row, index, "site", 7) || "").trim(),
      lat: toNullableNumber(getCell(row, index, "lat", 8)),
      lng: toNullableNumber(getCell(row, index, "lng", 9)),
      metadata: safeJson(getCell(row, index, "metadata", 10))
    };
  }).filter(Boolean);
}

function parseRoster(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildIndex(headers);

  return records.map((row) => {
    const studentId = normalizeStudentId(getCell(row, index, "studentid", 0));
    const studentName = String(getCell(row, index, "studentname", 1) || "").trim();
    const status = String(getCell(row, index, "status", 2) || "active").trim().toLowerCase() || "active";

    if (!studentId || !studentName) {
      return null;
    }

    return {
      studentId,
      studentName,
      status
    };
  }).filter(Boolean);
}

function buildSheetCsvUrl(targetSheetId, sheetName) {
  return `https://docs.google.com/spreadsheets/d/${targetSheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function fetchSheetRows(targetSheetId, sheetName) {
  const url = buildSheetCsvUrl(targetSheetId, sheetName);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sheetName} (${response.status}).`);
  }

  const text = await response.text();
  if (!text || text.includes("<!DOCTYPE html>")) {
    throw new Error(`Failed to read ${sheetName} as CSV. Verify sheet sharing permissions.`);
  }
  return parseCsv(text);
}

async function run() {
  console.log(`Starting migration from Google Sheet: ${sheetId}`);

  const fetched = await Promise.all(
    SHEETS.map(async (sheetName) => ({
      sheetName,
      rows: await fetchSheetRows(sheetId, sheetName)
    }))
  );

  const rowsBySheet = Object.fromEntries(fetched.map((entry) => [entry.sheetName, entry.rows]));

  const logs = parseLogs(rowsBySheet.Logs || []);
  const shifts = parseShifts(rowsBySheet.Shifts || []);
  const points = parsePoints(rowsBySheet.Points || []);
  const audit = parseAudit(rowsBySheet.Audit || []);
  const roster = parseRoster(rowsBySheet.Roster || []);

  console.log(`Fetched rows: logs=${logs.length} shifts=${shifts.length} points=${points.length} audit=${audit.length} roster=${roster.length}`);

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (truncateFirst) {
      await client.query("TRUNCATE TABLE attendance_events, shifts, points, audit_log RESTART IDENTITY");
      await client.query("UPDATE students SET status = 'inactive', updated_at = NOW()");
    }

    for (const row of roster) {
      await client.query(
        `
        INSERT INTO students (student_id, student_name, status, baseline_points)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (student_id)
        DO UPDATE SET
          student_name = EXCLUDED.student_name,
          status = EXCLUDED.status,
          updated_at = NOW()
        `,
        [row.studentId, row.studentName, row.status]
      );
    }

    for (const row of logs) {
      await client.query(
        `
        INSERT INTO students (student_id, student_name, status, baseline_points)
        VALUES ($1, $2, 'active', 0)
        ON CONFLICT (student_id)
        DO UPDATE SET
          student_name = EXCLUDED.student_name,
          updated_at = NOW()
        `,
        [row.studentId, row.studentName]
      );

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
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11
        )
        ON CONFLICT (event_id) DO NOTHING
        `,
        [
          row.eventId,
          row.timestampUtc,
          row.localDate,
          row.studentId,
          row.studentName,
          row.action,
          row.site,
          row.lat,
          row.lng,
          JSON.stringify(row.metadata || {}),
          row.source
        ]
      );
    }

    for (const row of shifts) {
      await client.query(
        `
        INSERT INTO students (student_id, student_name, status, baseline_points)
        VALUES ($1, $2, 'active', 0)
        ON CONFLICT (student_id)
        DO UPDATE SET
          student_name = EXCLUDED.student_name,
          updated_at = NOW()
        `,
        [row.studentId, row.studentName]
      );

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
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()
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
          row.shiftId,
          row.localDate,
          row.studentId,
          row.studentName,
          row.site,
          row.checkInUtc,
          row.checkOutUtc,
          row.durationMinutes,
          row.hoursDecimal,
          row.checkInPoints,
          row.checkOutPoints,
          row.totalPoints,
          row.status,
          row.source,
          row.notes
        ]
      );
    }

    for (const row of points) {
      await client.query(
        `
        INSERT INTO students (student_id, student_name, status, baseline_points)
        VALUES ($1, $2, 'active', $3)
        ON CONFLICT (student_id)
        DO UPDATE SET
          student_name = EXCLUDED.student_name,
          baseline_points = EXCLUDED.baseline_points,
          updated_at = NOW()
        `,
        [row.studentId, row.studentName, row.baselinePoints]
      );

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
        ) VALUES (
          $1,$2,$3,$4,$5,$6,NOW()
        )
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
          row.studentId,
          row.studentName,
          row.baselinePoints,
          row.earnedPoints,
          row.totalPoints,
          row.lastUpdated
        ]
      );
    }

    for (const row of audit) {
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
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb
        )
        `,
        [
          row.timestampUtc,
          row.localDate,
          row.actorType,
          row.studentId,
          row.action,
          row.outcomeCode,
          row.message,
          row.site,
          row.lat,
          row.lng,
          JSON.stringify(row.metadata || {})
        ]
      );
    }

    await client.query("COMMIT");

    const summary = {};
    for (const table of ["attendance_events", "shifts", "points", "audit_log", "students"]) {
      const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      summary[table] = result.rows[0].count;
    }

    console.log("Migration completed.");
    console.log(summary);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
