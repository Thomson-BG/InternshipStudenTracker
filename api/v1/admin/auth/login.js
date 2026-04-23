const { methodNotAllowed, ok, parseJsonBody } = require("../../../../server/lib/http");
const { handleApi } = require("../../../../server/lib/handlers");
const { adminLogin } = require("../../../../server/lib/service");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  return handleApi(res, async () => {
    const payload = await parseJsonBody(req);
    const result = await adminLogin(payload.password);
    return ok(res, result);
  });
};
