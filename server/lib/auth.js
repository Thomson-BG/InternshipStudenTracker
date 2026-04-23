const crypto = require("crypto");
const { CONFIG, RESPONSE_CODES } = require("./config");
const { AppError } = require("./errors");
const { sha256Hex, safeEqualHash, stringify } = require("./utils");

async function cleanupExpiredSessions(client) {
  await client.query("DELETE FROM admin_sessions WHERE expires_at <= NOW()");
}

function hashPassword(password) {
  return sha256Hex(password || "");
}

function isValidAdminPassword(password) {
  const providedHash = hashPassword(password);
  return safeEqualHash(providedHash, CONFIG.adminPasswordHash);
}

async function createAdminSession(client) {
  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + CONFIG.adminSessionHours * 60 * 60 * 1000);

  await client.query(
    `
    INSERT INTO admin_sessions (token_hash, expires_at)
    VALUES ($1, $2)
    `,
    [tokenHash, expiresAt.toISOString()]
  );

  return {
    token,
    expiresAt: expiresAt.toISOString()
  };
}

async function requireAdminToken(client, token) {
  const normalized = stringify(token);
  if (!normalized) {
    throw new AppError(RESPONSE_CODES.authRequired, "Admin token required.", {
      statusCode: 401
    });
  }

  await cleanupExpiredSessions(client);

  const tokenHash = sha256Hex(normalized);
  const result = await client.query(
    `
    SELECT token_hash, expires_at
    FROM admin_sessions
    WHERE token_hash = $1
    LIMIT 1
    `,
    [tokenHash]
  );

  if (!result.rows.length) {
    throw new AppError(RESPONSE_CODES.authRequired, "Admin session is missing or expired.", {
      statusCode: 401
    });
  }

  const expiresAt = new Date(result.rows[0].expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await client.query("DELETE FROM admin_sessions WHERE token_hash = $1", [tokenHash]);
    throw new AppError(RESPONSE_CODES.authRequired, "Admin session has expired.", {
      statusCode: 401
    });
  }

  return true;
}

module.exports = {
  cleanupExpiredSessions,
  createAdminSession,
  isValidAdminPassword,
  requireAdminToken
};
