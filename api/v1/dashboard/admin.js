const { methodNotAllowed, ok, getQueryValue, getTokenFromRequest } = require("../../../server/lib/http");
const { handleApi } = require("../../../server/lib/handlers");
const { fetchAdminDashboard } = require("../../../server/lib/service");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return handleApi(res, async () => {
    const token = getTokenFromRequest(req);
    const range = getQueryValue(req, "range", "overall");
    const site = getQueryValue(req, "site", "all");
    const result = await fetchAdminDashboard({ token, range, site });
    return ok(res, result);
  });
};
