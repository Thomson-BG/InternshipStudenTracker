const { getSql, initSchema, closeSql } = require("../api/_lib/db");

async function main() {
  const sql = getSql();
  await initSchema(sql);
  console.log("Neon schema initialized.");
  await closeSql();
}

main().catch(async (error) => {
  console.error("Failed to initialize schema:", error.message);
  try {
    await closeSql();
  } catch {
    // ignore
  }
  process.exit(1);
});
