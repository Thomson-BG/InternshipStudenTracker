const { methodNotAllowed, ok } = require("../../server/lib/http");
const { handleApi } = require("../../server/lib/handlers");
const { ensureDatabaseReady } = require("../../server/lib/schema");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return handleApi(res, async () => {
    await ensureDatabaseReady();
    return ok(res, {
      ok: true,
      service: "intern-track-api",
      db: "ready",
      timestamp: new Date().toISOString()
    });
  });
};
