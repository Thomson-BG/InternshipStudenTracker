const { methodNotAllowed, ok, getQueryValue } = require("../../../server/lib/http");
const { handleApi } = require("../../../server/lib/handlers");
const { fetchStudentDashboard } = require("../../../server/lib/service");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return handleApi(res, async () => {
    const studentId = getQueryValue(req, "studentId", "");
    const range = getQueryValue(req, "range", "week");
    const result = await fetchStudentDashboard({ studentId, range });
    return ok(res, result);
  });
};
