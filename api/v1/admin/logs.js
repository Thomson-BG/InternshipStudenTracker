const { methodNotAllowed, ok, getTokenFromRequest } = require("../../../server/lib/http");
const { handleApi } = require("../../../server/lib/handlers");
const { fetchLogs } = require("../../../server/lib/service");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return handleApi(res, async () => {
    const token = getTokenFromRequest(req);
    const result = await fetchLogs({ token });
    return ok(res, result);
  });
};
