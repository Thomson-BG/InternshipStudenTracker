#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { getPool } = require("../lib/db");
const { CONFIG } = require("../lib/config");

async function run() {
  const schemaPath = path.resolve(__dirname, "../sql/schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);

    for (const [studentId, studentName] of Object.entries(CONFIG.defaultRoster)) {
      await client.query(
        `
        INSERT INTO students (student_id, student_name, status, baseline_points)
        VALUES ($1, $2, 'active', 0)
        ON CONFLICT (student_id)
        DO UPDATE SET student_name = EXCLUDED.student_name, updated_at = NOW()
        `,
        [studentId, studentName]
      );

      await client.query(
        `
        INSERT INTO points (student_id, student_name, baseline_points, earned_points, total_points)
        VALUES ($1, $2, 0, 0, 0)
        ON CONFLICT (student_id)
        DO NOTHING
        `,
        [studentId, studentName]
      );
    }

    for (const site of CONFIG.defaultSites) {
      await client.query(
        `
        INSERT INTO sites (site_name, lat, lng, active)
        VALUES ($1, $2, $3, TRUE)
        ON CONFLICT (site_name)
        DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, active = TRUE, updated_at = NOW()
        `,
        [site.name, site.lat, site.lng]
      );
    }

    await client.query("COMMIT");
    console.log("Database schema and default seed completed.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("init-db failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
