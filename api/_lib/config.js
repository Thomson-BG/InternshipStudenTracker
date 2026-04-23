const CONFIG = {
  timezone: "America/Los_Angeles",
  goLiveDate: "2026-02-24",
  pointsPerAction: 5,
  minMinutesBetweenInOut: 60,
  adminSessionHours: 8,
  defaultAdminPasswordHash: "79f0da1b920dade97eb4e9e02df79a606c265d69349a600a65c0d4e289feaa44"
};

const RANGE_KEYS = ["week", "month", "overall"];

const COMPLETE_STATUSES = {
  COMPLETE: true,
  BACKFILLED_COMPLETE: true,
  COMPLETED: true
};

const RESPONSE_CODES = {
  recorded: "RECORDED",
  invalidPayload: "INVALID_PAYLOAD",
  invalidAction: "INVALID_ACTION",
  invalidMode: "INVALID_MODE",
  invalidRange: "INVALID_RANGE",
  missingField: "MISSING_FIELD",
  unknownStudent: "UNKNOWN_STUDENT",
  alreadyCheckedIn: "ALREADY_CHECKED_IN",
  alreadyCheckedOut: "ALREADY_CHECKED_OUT",
  checkinRequired: "CHECKIN_REQUIRED",
  cooldownNotMet: "COOLDOWN_NOT_MET",
  authRequired: "AUTH_REQUIRED",
  invalidCredentials: "INVALID_CREDENTIALS",
  serverError: "SERVER_ERROR"
};

module.exports = {
  CONFIG,
  RANGE_KEYS,
  COMPLETE_STATUSES,
  RESPONSE_CODES
};
