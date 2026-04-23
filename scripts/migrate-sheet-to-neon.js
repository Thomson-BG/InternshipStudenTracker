const { getSql, initSchema, closeSql } = require("../api/_lib/db");
const {
  buildHeaderIndex,
  coerceCoordinate,
  coerceNumber,
  formatLocalDate,
  getCellByHeader,
  isLocalDateString,
  normalizeLocalDateCell,
  normalizeStudentId,
  normalizeUtcTimestampCell,
  parseJsonSafe,
  sha256Hex,
  stringify
} = require("../api/_lib/utils");
const { CONFIG } = require("../api/_lib/config");

const DEFAULT_SHEET_ID = "1Dd4qJ3SkARcigi-kmM9wCUc9NkRqpQoEkFVri7_FKlY";

function buildSheetCsvUrl(sheetId, sheetName) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

function parseCsvTable(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
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

async function fetchSheetRows(sheetId, sheetName) {
  const response = await fetch(buildSheetCsvUrl(sheetId, sheetName));
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sheetName} CSV (${response.status}).`);
  }
  const csv = await response.text();
  return parseCsvTable(csv);
}

function looksLikeUserAgent(value) {
  const text = stringify(value);
  return Boolean(text) && (
    text.startsWith("Mozilla/")
    || text.includes("AppleWebKit/")
    || text.includes("Chrome/")
    || text.includes("Safari/")
    || text.includes("Mobile/")
  );
}

function parseRosterRows(rows) {
  if (!rows.length) {
    return [];
  }
  const [headers, ...records] = rows;
  const index = buildHeaderIndex(headers);

  return records.map((row) => {
    const studentId = normalizeStudentId(getCellByHeader(row, index, "studentid", 0));
    const studentName = stringify(getCellByHeader(row, index, "studentname", 1));
    const status = stringify(getCellByHeader(row, index, "status", 2) || "active").toLowerCase() || "active";
    return {
      studentId,
      studentName,
      status
    };
  }).filter((row) => row.studentId && row.studentName);
}

function resolveLogMetadata(row, index) {
  const metadataCandidates = [
    getCellByHeader(row, index, "metadata"),
    row[8],
    row[9]
  ];

  for (const value of metadataCandidates) {
    if (!value) {
      continue;
    }
    if (typeof value === "string" && value.startsWith("{")) {
      return parseJsonSafe(value);
    }
    if (looksLikeUserAgent(value)) {
      return { userAgent: stringify(value) };
    }
  }

  return {};
}

function resolveLogCoordinates(row, index) {
  const candidates = [
    [getCellByHeader(row, index, "lat"), getCellByHeader(row, index, "lng")],
    [row[7], row[8]],
    [row[5], row[6]]
  ];

  for (const [latValue, lngValue] of candidates) {
    const lat = coerceCoordinate(latValue, -90, 90);
    const lng = coerceCoordinate(lngValue, -180, 180);
    if (lat !== "" && lng !== "") {
      return { lat, lng };
    }
  }

  return { lat: null, lng: null };
}

function resolveLogLocalDate(row, index, timestamp) {
  const candidates = [
    getCellByHeader(row, index, "localdate"),
    row[7],
    row[8]
  ];

  for (const value of candidates) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return formatLocalDate(value, CONFIG.timezone);
    }
    const localDate = stringify(value);
    if (isLocalDateString(localDate)) {
      return localDate;
    }
  }

  return formatLocalDate(timestamp, CONFIG.timezone);
}

function parseLogRows(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildHeaderIndex(headers);
  const seenEventIds = new Set();

  return records.map((row, recordIndex) => {
    const timestampRaw = getCellByHeader(row, index, "timestamputc", 0) || row[0];
    if (!timestampRaw) {
      return null;
    }

    const timestamp = timestampRaw instanceof Date ? timestampRaw : new Date(timestampRaw);
    if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
      return null;
    }

    const metadata = resolveLogMetadata(row, index);
    const coordinates = resolveLogCoordinates(row, index);
    const localDate = resolveLogLocalDate(row, index, timestamp);
    const explicitEventId = stringify(getCellByHeader(row, index, "eventid"));
    let eventId = explicitEventId && !looksLikeUserAgent(explicitEventId) ? explicitEventId : `legacy-${recordIndex + 1}`;
    if (seenEventIds.has(eventId)) {
      eventId = `${eventId}-dup-${recordIndex + 1}`;
    }
    seenEventIds.add(eventId);

    const explicitSource = stringify(getCellByHeader(row, index, "source", 10) || row[10]);
    const source = explicitSource && !looksLikeUserAgent(explicitSource)
      ? explicitSource
      : stringify(metadata.source) || "legacy";

    return {
      eventId,
      timestampUtc: timestamp.toISOString(),
      localDate,
      studentId: normalizeStudentId(getCellByHeader(row, index, "studentid", 1)),
      studentName: stringify(getCellByHeader(row, index, "studentname", 2)),
      action: stringify(getCellByHeader(row, index, "action", 3)),
      site: stringify(getCellByHeader(row, index, "site", 4)),
      lat: coordinates.lat,
      lng: coordinates.lng,
      metadata,
      source
    };
  }).filter((row) => row && row.studentId && row.timestampUtc && row.localDate);
}

function parseShiftRows(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildHeaderIndex(headers);

  return records.map((row) => {
    const studentId = normalizeStudentId(getCellByHeader(row, index, "studentid", 2));
    const localDate = normalizeLocalDateCell(getCellByHeader(row, index, "localdate", 1), CONFIG.timezone);
    const shiftId = stringify(getCellByHeader(row, index, "shiftid", 0)) || `${studentId}-${localDate}`;
    return {
      shiftId,
      localDate,
      studentId,
      studentName: stringify(getCellByHeader(row, index, "studentname", 3)),
      site: stringify(getCellByHeader(row, index, "site", 4)),
      checkInUtc: normalizeUtcTimestampCell(getCellByHeader(row, index, "checkinutc", 5)),
      checkOutUtc: normalizeUtcTimestampCell(getCellByHeader(row, index, "checkoututc", 6)),
      durationMinutes: Number(getCellByHeader(row, index, "durationminutes", 7) || 0),
      hoursDecimal: Number(getCellByHeader(row, index, "hoursdecimal", 8) || 0),
      checkInPoints: Number(getCellByHeader(row, index, "checkinpoints", 9) || 0),
      checkOutPoints: Number(getCellByHeader(row, index, "checkoutpoints", 10) || 0),
      totalPoints: Number(getCellByHeader(row, index, "totalpoints", 11) || 0),
      status: stringify(getCellByHeader(row, index, "status", 12)),
      source: stringify(getCellByHeader(row, index, "source", 13) || "legacy"),
      notes: stringify(getCellByHeader(row, index, "notes", 14))
    };
  }).filter((row) => row.studentId && row.localDate);
}

function parsePointRows(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildHeaderIndex(headers);

  return records.map((row) => ({
    studentId: normalizeStudentId(getCellByHeader(row, index, "studentid", 0)),
    studentName: stringify(getCellByHeader(row, index, "studentname", 1)),
    baselinePoints: Number(getCellByHeader(row, index, "baselinepoints", 2) || 0),
    earnedPoints: Number(getCellByHeader(row, index, "earnedpoints", 3) || 0),
    totalPoints: Number(getCellByHeader(row, index, "totalpoints", 4) || 0),
    lastUpdated: normalizeUtcTimestampCell(getCellByHeader(row, index, "lastupdated", 5))
  })).filter((row) => row.studentId);
}

function parseAuditRows(rows) {
  if (!rows.length) {
    return [];
  }

  const [headers, ...records] = rows;
  const index = buildHeaderIndex(headers);

  return records.map((row) => {
    const timestampUtc = normalizeUtcTimestampCell(getCellByHeader(row, index, "timestamputc", 0));
    if (!timestampUtc) {
      return null;
    }

    const localDate = normalizeLocalDateCell(getCellByHeader(row, index, "localdate", 1), CONFIG.timezone)
      || formatLocalDate(new Date(timestampUtc), CONFIG.timezone);

    const actorType = stringify(getCellByHeader(row, index, "actortype", 2));
    const studentId = normalizeStudentId(getCellByHeader(row, index, "studentid", 3));
    const action = stringify(getCellByHeader(row, index, "action", 4));
    const outcomeCode = stringify(getCellByHeader(row, index, "outcomecode", 5));
    const message = stringify(getCellByHeader(row, index, "message", 6));
    const site = stringify(getCellByHeader(row, index, "site", 7));
    const lat = coerceNumber(getCellByHeader(row, index, "lat", 8));
    const lng = coerceNumber(getCellByHeader(row, index, "lng", 9));
    const metadata = parseJsonSafe(getCellByHeader(row, index, "metadata", 10));

    const fingerprint = sha256Hex([
      timestampUtc,
      localDate,
      actorType,
      studentId,
      action,
      outcomeCode,
      message,
      site,
      lat,
      lng,
      JSON.stringify(metadata || {})
    ].join("|"));

    return {
      timestampUtc,
      localDate,
      actorType,
      studentId,
      action,
      outcomeCode,
      message,
      site,
      lat: lat === "" ? null : Number(lat),
      lng: lng === "" ? null : Number(lng),
      metadata,
      fingerprint
    };
  }).filter(Boolean);
}

async function main() {
  const sheetId = stringify(process.env.GOOGLE_SHEET_ID) || DEFAULT_SHEET_ID;
  const sql = getSql();

  console.log(`Fetching Google Sheet data from ${sheetId} ...`);
  const [rosterRows, logRows, shiftRows, pointRows, auditRows] = await Promise.all([
    fetchSheetRows(sheetId, "Roster"),
    fetchSheetRows(sheetId, "Logs"),
    fetchSheetRows(sheetId, "Shifts"),
    fetchSheetRows(sheetId, "Points"),
    fetchSheetRows(sheetId, "Audit")
  ]);

  const roster = parseRosterRows(rosterRows);
  const logs = parseLogRows(logRows);
  const shifts = parseShiftRows(shiftRows);
  const points = parsePointRows(pointRows);
  const audits = parseAuditRows(auditRows);

  console.log(`Parsed rows: roster=${roster.length}, logs=${logs.length}, shifts=${shifts.length}, points=${points.length}, audit=${audits.length}`);

  await initSchema(sql);

  await sql.begin(async (tx) => {
    for (const row of roster) {
      await tx`
        INSERT INTO roster (student_id, student_name, status, updated_at)
        VALUES (${row.studentId}, ${row.studentName}, ${row.status}, NOW())
        ON CONFLICT (student_id)
        DO UPDATE SET
          student_name = EXCLUDED.student_name,
          status = EXCLUDED.status,
          updated_at = NOW()
      `;
    }

    for (const row of logs) {
      await tx`
        INSERT INTO logs (
          event_id, timestamp_utc, local_date, student_id, student_name,
          action, site, lat, lng, metadata, source
        ) VALUES (
          ${row.eventId},
          ${row.timestampUtc},
          ${row.localDate},
          ${row.studentId},
          ${row.studentName},
          ${row.action},
          ${row.site},
          ${row.lat === null || row.lat === "" ? null : Number(row.lat)},
          ${row.lng === null || row.lng === "" ? null : Number(row.lng)},
          ${JSON.stringify(row.metadata || {})}::jsonb,
          ${row.source || "legacy"}
        )
        ON CONFLICT (event_id)
        DO UPDATE SET
          timestamp_utc = EXCLUDED.timestamp_utc,
          local_date = EXCLUDED.local_date,
          student_id = EXCLUDED.student_id,
          student_name = EXCLUDED.student_name,
          action = EXCLUDED.action,
          site = EXCLUDED.site,
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          metadata = EXCLUDED.metadata,
          source = EXCLUDED.source
      `;
    }

    for (const row of shifts) {
      await tx`
        INSERT INTO shifts (
          shift_id, local_date, student_id, student_name, site,
          check_in_utc, check_out_utc, duration_minutes, hours_decimal,
          check_in_points, check_out_points, total_points,
          status, source, notes, updated_at
        ) VALUES (
          ${row.shiftId},
          ${row.localDate},
          ${row.studentId},
          ${row.studentName},
          ${row.site},
          ${row.checkInUtc || null},
          ${row.checkOutUtc || null},
          ${row.durationMinutes || 0},
          ${row.hoursDecimal || 0},
          ${row.checkInPoints || 0},
          ${row.checkOutPoints || 0},
          ${row.totalPoints || 0},
          ${row.status || ""},
          ${row.source || "legacy"},
          ${row.notes || ""},
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

    for (const row of points) {
      await tx`
        INSERT INTO points (
          student_id, student_name, baseline_points, earned_points,
          total_points, last_updated, updated_at
        ) VALUES (
          ${row.studentId},
          ${row.studentName || row.studentId},
          ${row.baselinePoints || 0},
          ${row.earnedPoints || 0},
          ${row.totalPoints || 0},
          ${row.lastUpdated || null},
          NOW()
        )
        ON CONFLICT (student_id)
        DO UPDATE SET
          student_name = EXCLUDED.student_name,
          baseline_points = EXCLUDED.baseline_points,
          earned_points = EXCLUDED.earned_points,
          total_points = EXCLUDED.total_points,
          last_updated = EXCLUDED.last_updated,
          updated_at = NOW()
      `;
    }

    for (const row of audits) {
      await tx`
        INSERT INTO audit (
          timestamp_utc, local_date, actor_type, student_id, action,
          outcome_code, message, site, lat, lng, metadata, audit_fingerprint
        ) VALUES (
          ${row.timestampUtc},
          ${row.localDate},
          ${row.actorType},
          ${row.studentId},
          ${row.action},
          ${row.outcomeCode},
          ${row.message},
          ${row.site},
          ${row.lat},
          ${row.lng},
          ${JSON.stringify(row.metadata || {})}::jsonb,
          ${row.fingerprint}
        )
        ON CONFLICT DO NOTHING
      `;
    }
  });

  const [rosterCount, logsCount, shiftsCount, pointsCount, auditCount] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM roster`,
    sql`SELECT COUNT(*)::int AS count FROM logs`,
    sql`SELECT COUNT(*)::int AS count FROM shifts`,
    sql`SELECT COUNT(*)::int AS count FROM points`,
    sql`SELECT COUNT(*)::int AS count FROM audit`
  ]);

  console.log("Neon import complete.");
  console.log(`DB counts: roster=${rosterCount[0].count}, logs=${logsCount[0].count}, shifts=${shiftsCount[0].count}, points=${pointsCount[0].count}, audit=${auditCount[0].count}`);

  await closeSql();
}

main().catch(async (error) => {
  console.error("Migration failed:", error.message);
  try {
    await closeSql();
  } catch {
    // ignore
  }
  process.exit(1);
});
