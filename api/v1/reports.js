const { methodNotAllowed, ok, getQueryValue, getTokenFromRequest } = require("../../server/lib/http");
const { handleApi } = require("../../server/lib/handlers");
const { fetchReportData } = require("../../server/lib/service");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return handleApi(res, async () => {
    const token = getTokenFromRequest(req);
    const type = getQueryValue(req, "type", "cohort");
    const range = getQueryValue(req, "range", "overall");
    const site = getQueryValue(req, "site", "all");
    const studentId = getQueryValue(req, "studentId", "");

    const result = await fetchReportData({ token, type, range, site, studentId });
    return ok(res, result);
  });
};
