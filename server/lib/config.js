const DEFAULT_ADMIN_PASSWORD_HASH = "79f0da1b920dade97eb4e9e02df79a606c265d69349a600a65c0d4e289feaa44";

const DEFAULT_ROSTER = {
  "131923": "Jordan Belvin",
  "168115": "Jonah Chavez",
  "131523": "Adrian Delgado Hernandez",
  "160601": "Lenore Ditmore",
  "132819": "Scarlet Grady",
  "126607": "Adrian Herrera",
  "132120": "Ethan Little",
  "131352": "Diego Ochoa",
  "159660": "Azriel Perez",
  "133569": "Porter Preston",
  "160166": "Maximus Robles",
  "131356": "Adrian Rodriguez Valdes",
  "155404": "Carlos Salgado",
  "132483": "James Windham",
  "125814": "Zacharias Bramhall",
  "010101": "Mr. Thomson"
};

const DEFAULT_SITES = [
  { name: "Alliance Diesel", lat: 33.7681647078012, lng: -116.96797385328925 },
  { name: "Phils Auto Clinic", lat: 33.74851138217792, lng: -116.92004436101942 },
  { name: "Levi's Automotive", lat: 33.74788219854886, lng: -116.97554790660938 },
  { name: "HUSD Transportation Dept.", lat: 33.74189676349582, lng: -116.99100203721602 },
  { name: "Tim Moran Ford", lat: 33.73933869093443, lng: -117.03070412707285 },
  { name: "Tim Moran Hyundai", lat: 33.73934670369273, lng: -117.03000554135964 },
  { name: "Tim Moran Chevrolet", lat: 33.74099416475308, lng: -117.02873711340769 },
  { name: "Hemet High Bulldog Garage", lat: 33.728014603500704, lng: -116.93369905999955 }
];

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

const RANGE_KEYS = ["week", "month", "overall"];

const CONFIG = {
  timezone: process.env.APP_TIMEZONE || "America/Los_Angeles",
  goLiveDate: process.env.POINTS_GO_LIVE_DATE || "2026-02-24",
  pointsPerAction: Number(process.env.POINTS_PER_ACTION || 5),
  minMinutesBetweenInOut: Number(process.env.MIN_MINUTES_BETWEEN_IN_OUT || 60),
  adminSessionHours: Number(process.env.ADMIN_SESSION_HOURS || 8),
  databaseUrl: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "",
  adminPasswordHash: (process.env.ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_PASSWORD_HASH).trim().toLowerCase(),
  defaultRoster: DEFAULT_ROSTER,
  defaultSites: DEFAULT_SITES,
  responseCodes: RESPONSE_CODES,
  rangeKeys: RANGE_KEYS,
  completeStatuses: new Set(["COMPLETE", "BACKFILLED_COMPLETE", "COMPLETED"])
};

module.exports = {
  CONFIG,
  RESPONSE_CODES,
  RANGE_KEYS
};
