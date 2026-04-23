const { fail } = require("./http");
const { asAppError } = require("./errors");
const { RESPONSE_CODES } = require("./config");

async function handleApi(res, fn) {
  try {
    return await fn();
  } catch (error) {
    const appError = asAppError(error, RESPONSE_CODES.serverError, error?.message || "Server error.");
    if (appError.statusCode >= 500) {
      console.error("[api]", error);
    }
    return fail(
      res,
      appError.code || RESPONSE_CODES.serverError,
      appError.message || "Server error.",
      appError.extra || {},
      appError.statusCode || 500
    );
  }
}

module.exports = {
  handleApi
};
