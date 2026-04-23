const { methodNotAllowed, ok } = require("../../server/lib/http");
const { handleApi } = require("../../server/lib/handlers");
const { fetchRoster } = require("../../server/lib/service");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  return handleApi(res, async () => {
    const result = await fetchRoster();
    return ok(res, result);
  });
};
