const { Pool } = require("pg");
const { CONFIG } = require("./config");

let pool = null;

function getPool() {
  if (pool) {
    return pool;
  }

  if (!CONFIG.databaseUrl) {
    throw new Error("Missing NEON_DATABASE_URL (or DATABASE_URL) environment variable.");
  }

  pool = new Pool({
    connectionString: CONFIG.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: false
    }
  });

  pool.on("error", (error) => {
    console.error("[db] Unexpected pool error", error);
  });

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function withClient(handler) {
  const client = await getPool().connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

async function withTransaction(handler) {
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await handler(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

module.exports = {
  getPool,
  query,
  withClient,
  withTransaction
};
