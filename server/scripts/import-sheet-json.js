#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { getPool } = require("../lib/db");

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return [];
  }
  return JSON.parse(raw);
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

async function run() {
  const inputDir = path.resolve(process.argv[2] || "./migration-data");
  const logs = loadJson(path.join(inputDir, "logs.json"));
  const shifts = loadJson(path.join(inputDir, "shifts.json"));
  const points = loadJson(path.join(inputDir, "points.json"));
  const audit = loadJson(path.join(inputDir, "audit.json"));
  const roster = loadJson(path.join(inputDir, "roster.json"));

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const row of roster) {
      await client.query(
        `
        INSERT INTO students (student_id, student_name, status, baseline_points)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (student_id)
        DO UPDATE SET student_name = EXCLUDED.student_name, status = EXCLUDED.status, baseline_points = EXCLUDED.baseline_points, updated_at = NOW()
        `,
        [
          String(row.studentId || "").padStart(6, "0"),
          String(row.studentName || "").trim(),
          String(row.status || "active").trim().toLowerCase() || "active",
          Number(row.baselinePoints || 0)
        ]
      );
    }

    for (const row of logs) {
      const timestamp = toIso(row.timestampUtc);
      if (!timestamp) continue;
      await client.query(
        `
        INSERT INTO attendance_events (
          event_id, timestamp_utc, local_date, student_id, student_name, action, site, lat, lng, metadata, source
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11
        )
        ON CONFLICT (event_id) DO NOTHING
        `,
        [
          String(row.eventId || `${row.studentId}-${row.timestampUtc}`),
          timestamp,
          String(row.localDate || ""),
          String(row.studentId || "").padStart(6, "0"),
          String(row.studentName || "").trim(),
          String(row.action || "").trim(),
          String(row.site || "").trim(),
          row.lat === "" || row.lat === null || row.lat === undefined ? null : Number(row.lat),
          row.lng === "" || row.lng === null || row.lng === undefined ? null : Number(row.lng),
          JSON.stringify(row.metadata || {}),
          String(row.source || "legacy").trim() || "legacy"
        ]
      );
    }

    for (const row of shifts) {
      await client.query(
        `
        INSERT INTO shifts (
          shift_id, local_date, student_id, student_name, site, check_in_utc, check_out_utc,
          duration_minutes, hours_decimal, check_in_points, check_out_points, total_points,
          status, source, notes, updated_at
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
          String(row.shiftId || `${row.studentId}-${row.localDate}`),
          String(row.localDate || ""),
          String(row.studentId || "").padStart(6, "0"),
          String(row.studentName || "").trim(),
          String(row.site || "").trim(),
          toIso(row.checkInUtc),
          toIso(row.checkOutUtc),
          Number(row.durationMinutes || 0),
          Number(row.hoursDecimal || 0),
          Number(row.checkInPoints || 0),
          Number(row.checkOutPoints || 0),
          Number(row.totalPoints || 0),
          String(row.status || "NOT_STARTED"),
          String(row.source || "legacy"),
          String(row.notes || "")
        ]
      );
    }

    for (const row of points) {
      await client.query(
        `
        INSERT INTO points (
          student_id, student_name, baseline_points, earned_points, total_points, last_updated, updated_at
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
          String(row.studentId || "").padStart(6, "0"),
          String(row.studentName || "").trim(),
          Number(row.baselinePoints || 0),
          Number(row.earnedPoints || 0),
          Number(row.totalPoints || 0),
          toIso(row.lastUpdated)
        ]
      );
    }

    for (const row of audit) {
      const timestamp = toIso(row.timestampUtc) || new Date().toISOString();
      await client.query(
        `
        INSERT INTO audit_log (
          timestamp_utc, local_date, actor_type, student_id, action, outcome_code, message, site, lat, lng, metadata
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb
        )
        `,
        [
          timestamp,
          String(row.localDate || timestamp.slice(0, 10)),
          String(row.actorType || "STUDENT"),
          String(row.studentId || "").padStart(6, "0"),
          String(row.action || ""),
          String(row.outcomeCode || ""),
          String(row.message || ""),
          String(row.site || ""),
          row.lat === "" || row.lat === null || row.lat === undefined ? null : Number(row.lat),
          row.lng === "" || row.lng === null || row.lng === undefined ? null : Number(row.lng),
          JSON.stringify(row.metadata || {})
        ]
      );
    }

    await client.query("COMMIT");
    console.log("Import completed.");
    console.log(`roster=${roster.length} logs=${logs.length} shifts=${shifts.length} points=${points.length} audit=${audit.length}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Import failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
