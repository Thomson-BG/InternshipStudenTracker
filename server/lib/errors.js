class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = Number(options.statusCode || 400);
    this.extra = options.extra || {};
  }
}

function asAppError(error, fallbackCode = "SERVER_ERROR", fallbackMessage = "Unexpected server error.") {
  if (error instanceof AppError) {
    return error;
  }

  const wrapped = new AppError(fallbackCode, fallbackMessage, {
    statusCode: 500,
    extra: {}
  });
  wrapped.cause = error;
  return wrapped;
}

module.exports = {
  AppError,
  asAppError
};
