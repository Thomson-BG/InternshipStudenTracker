import {
  ADMIN_SESSION_KEY,
  LOCAL_HISTORY_KEY,
  RANGE_OPTIONS,
  STATUS_FILTER_OPTIONS,
  STUDENT_SESSION_TIMEOUT_MS,
  THEME_KEY
} from "./config.js";
import { readJsonStorage } from "./utils.js";

const persistedTheme = localStorage.getItem(THEME_KEY);

export const state = {
  theme: persistedTheme || "dark",
  currentView: "clock",
  roster: {},
  rosterLoading: false,
  localHistory: readJsonStorage(localStorage, LOCAL_HISTORY_KEY, []),
  student: {
    id: "",
    name: "",
    currentPos: null,
    selectedSite: null,
    nearbySites: [],
    loading: false,
    dashboard: null,
    dashboardCache: {},
    range: RANGE_OPTIONS[0],
    sessionTimer: null,
    requestController: null,
    activeRequestId: 0,
    prefetchTimer: null,
    lastActionTimestamps: {},
    timeoutMs: STUDENT_SESSION_TIMEOUT_MS
  },
  admin: {
    token: "",
    expiresAt: "",
    dashboard: null,
    loading: false,
    error: "",
    dataSource: "",
    dataQuality: "",
    range: RANGE_OPTIONS[2],
    site: "all",
    statusFilter: STATUS_FILTER_OPTIONS[0],
    search: "",
    selectedStudent: null
  }
};

export function restoreAdminSession() {
  const persisted = readJsonStorage(sessionStorage, ADMIN_SESSION_KEY, null);
  if (!persisted || !persisted.token || !persisted.expiresAt) {
    return;
  }
  if (new Date(persisted.expiresAt).getTime() <= Date.now()) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    return;
  }
  state.admin.token = persisted.token;
  state.admin.expiresAt = persisted.expiresAt;
}
