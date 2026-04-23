const { methodNotAllowed, ok, getTokenFromRequest } = require("../../../server/lib/http");
const { handleApi } = require("../../../server/lib/handlers");
const { fetchPoints } = require("../../../server/lib/service");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return handleApi(res, async () => {
    const token = getTokenFromRequest(req);
    const result = await fetchPoints({ token });
    return ok(res, result);
  });
};
