export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw3GBhNTbtaOlSVBL6r9SJqXX1CuTgSNP0DOnp8jxH0zvTofzyZkmK_OWruVqq9Fbs/exec";

export const API_ENDPOINTS = {
  submit: APPS_SCRIPT_URL,
  adminAuth: `${APPS_SCRIPT_URL}?mode=admin_auth`,
  studentDashboard: (studentId, range = "week") =>
    `${APPS_SCRIPT_URL}?mode=student_dashboard&studentId=${encodeURIComponent(studentId)}&range=${encodeURIComponent(range)}`,
  adminDashboard: (token, range = "overall", site = "all") =>
    `${APPS_SCRIPT_URL}?mode=admin_dashboard&token=${encodeURIComponent(token)}&range=${encodeURIComponent(range)}&site=${encodeURIComponent(site)}`,
  reportData: ({ token, type, range = "overall", site = "all", studentId = "" }) => {
    const parts = [
      `mode=report_data`,
      `token=${encodeURIComponent(token)}`,
      `type=${encodeURIComponent(type)}`,
      `range=${encodeURIComponent(range)}`,
      `site=${encodeURIComponent(site)}`
    ];
    if (studentId) {
      parts.push(`studentId=${encodeURIComponent(studentId)}`);
    }
    return `${APPS_SCRIPT_URL}?${parts.join("&")}`;
  },
  logs: (token) => `${APPS_SCRIPT_URL}?mode=logs&token=${encodeURIComponent(token)}`,
  points: (token) => `${APPS_SCRIPT_URL}?mode=points&token=${encodeURIComponent(token)}`,
  getRoster: () => `${APPS_SCRIPT_URL}?mode=get_roster`
};

export const ACTION_COOLDOWN_MS = 60 * 60 * 1000;
export const STUDENT_SESSION_TIMEOUT_MS = 90 * 1000;
export const STUDENT_LOOKUP_DEBOUNCE_MS = 120;
export const STUDENT_DASHBOARD_PREFETCH_DELAY_MS = 180;
export const LOCAL_HISTORY_KEY = "intern-track-local-history";
export const ADMIN_SESSION_KEY = "intern-track-admin-session";
export const THEME_KEY = "intern-track-theme";

export const RANGE_OPTIONS = ["week", "month", "overall"];
export const STATUS_FILTER_OPTIONS = ["all", "complete", "open", "exception"];

export const ALLOWED_RADIUS_METERS = 91.44;

export const ROSTER_FALLBACK = {
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

export const SITES = [
  { name: "Alliance Diesel", lat: 33.7681647078012, lng: -116.96797385328925 },
  { name: "Phils Auto Clinic", lat: 33.74851138217792, lng: -116.92004436101942 },
  { name: "Levi's Automotive", lat: 33.74788219854886, lng: -116.97554790660938 },
  { name: "HUSD Transportation Dept.", lat: 33.74189676349582, lng: -116.99100203721602 },
  { name: "Tim Moran Ford", lat: 33.73933869093443, lng: -117.03070412707285 },
  { name: "Tim Moran Hyundai", lat: 33.73934670369273, lng: -117.03000554135964 },
  { name: "Tim Moran Chevrolet", lat: 33.74099416475308, lng: -117.02873711340769 },
  { name: "Hemet High Bulldog Garage", lat: 33.728014603500704, lng: -116.93369905999955 }
];

export const CHART_COLORS = {
  brand: "#0A84FF",
  brandSoft: "rgba(10, 132, 255, 0.20)",
  accent: "#30D158",
  accentSoft: "rgba(48, 209, 88, 0.18)",
  success: "#30D158",
  info: "#64D2FF",
  infoSoft: "rgba(100, 210, 255, 0.20)",
  warning: "#FF9F0A",
  danger: "#FF453A",
  grid: "rgba(255, 255, 255, 0.06)",
  text: "rgba(235, 235, 245, 0.6)"
};
