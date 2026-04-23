const { methodNotAllowed, ok, parseJsonBody } = require("../../server/lib/http");
const { handleApi } = require("../../server/lib/handlers");
const { submitAttendance } = require("../../server/lib/service");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  return handleApi(res, async () => {
    const payload = await parseJsonBody(req);
    const result = await submitAttendance(payload);
    return ok(res, result);
  });
};
