import {
  ADMIN_SESSION_KEY,
  LOCAL_HISTORY_KEY,
  STUDENT_LOOKUP_DEBOUNCE_MS,
  ROSTER_FALLBACK,
  SITES,
  ALLOWED_RADIUS_METERS,
  THEME_KEY
} from "./config.js";
import { adminAuth, fetchAdminDashboard, fetchReportData, fetchRoster, fetchStudentDashboard, submitAttendance } from "./api.js";
import { renderAdminCharts, renderDetailCharts } from "./charts.js";
import { downloadReportPdf, openBrowserPrint, renderReportMarkup } from "./reports.js";
import { restoreAdminSession, state } from "./state.js";
import {
  debounce,
  downloadCsv,
  escapeHtml,
  formatCountdownMinutes,
  formatDate,
  formatDateTime,
  formatHours,
  formatPercent,
  formatPoints,
  formatShortDate,
  formatTimeOnly,
  haversineMeters,
  round,
  statusTone,
  toRangeLabel,
  writeJsonStorage
} from "./utils.js";

const dom = {
  body: document.body,
  themeToggle: document.getElementById("themeToggle"),
  themeIndicator: document.getElementById("themeIndicator"),
  topbarSummary: document.getElementById("topbarSummary"),
  navButtons: Array.from(document.querySelectorAll("[data-view-button]")),
  views: {
    clock: document.getElementById("clockView"),
    progress: document.getElementById("progressView"),
    admin: document.getElementById("adminView")
  },
  studentIdInput: document.getElementById("studentIdInput"),
  studentLookupLoader: document.getElementById("studentLookupLoader"),
  studentLookupLoaderText: document.getElementById("studentLookupLoaderText"),
  studentNameValue: document.getElementById("studentNameValue"),
  studentNameCopy: document.getElementById("studentNameCopy"),
  studentSessionBadge: document.getElementById("studentSessionBadge"),
  locationStatusBanner: document.getElementById("locationStatusBanner"),
  siteSelectWrap: document.getElementById("siteSelectWrap"),
  siteSelect: document.getElementById("siteSelect"),
  checkInButton: document.getElementById("checkInButton"),
  checkOutButton: document.getElementById("checkOutButton"),
  clearStudentButton: document.getElementById("clearStudentButton"),
  heroStatusCard: document.getElementById("heroStatusCard"),
  clockMessage: document.getElementById("clockMessage"),
  todayHeadline: document.getElementById("todayHeadline"),
  todayCopy: document.getElementById("todayCopy"),
  nextActionBadge: document.getElementById("nextActionBadge"),
  selectedSiteBadge: document.getElementById("selectedSiteBadge"),
  shiftTimerValue: document.getElementById("shiftTimerValue"),
  mapSiteName: document.getElementById("mapSiteName"),
  mapLatValue: document.getElementById("mapLatValue"),
  mapLngValue: document.getElementById("mapLngValue"),
  progressEmptyState: document.getElementById("progressEmptyState"),
  progressLoadingState: document.getElementById("progressLoadingState"),
  progressContent: document.getElementById("progressContent"),
  progressStudentName: document.getElementById("progressStudentName"),
  weekPointsStat: document.getElementById("weekPointsStat"),
  weekHoursStat: document.getElementById("weekHoursStat"),
  sevenDayHistoryList: document.getElementById("sevenDayHistoryList"),
  adminAuthBadge: document.getElementById("adminAuthBadge"),
  adminLoginState: document.getElementById("adminLoginState"),
  adminContent: document.getElementById("adminContent"),
  adminPasswordInput: document.getElementById("adminPasswordInput"),
  adminLoginButton: document.getElementById("adminLoginButton"),
  adminRefreshButton: document.getElementById("adminRefreshButton"),
  adminPrintCohortButton: document.getElementById("adminPrintCohortButton"),
  adminPdfCohortButton: document.getElementById("adminPdfCohortButton"),
  adminCsvButton: document.getElementById("adminCsvButton"),
  adminLogoutButton: document.getElementById("adminLogoutButton"),
  adminRangeSelect: document.getElementById("adminRangeSelect"),
  adminSiteSelect: document.getElementById("adminSiteSelect"),
  adminStatusSelect: document.getElementById("adminStatusSelect"),
  adminSearchInput: document.getElementById("adminSearchInput"),
  adminStateNotice: document.getElementById("adminStateNotice"),
  adminKpiGrid: document.getElementById("adminKpiGrid"),
  adminStudentsTableBody: document.getElementById("adminStudentsTableBody"),
  adminExceptionList: document.getElementById("adminExceptionList"),
  adminHeatmap: document.getElementById("adminHeatmap"),
  adminHeatmapLegend: document.getElementById("adminHeatmapLegend"),
  adminAdvancedDetails: document.getElementById("adminAdvancedDetails"),
  auditTrailList: document.getElementById("auditTrailList"),
  detailDrawer: document.getElementById("studentDetailDrawer"),
  closeDetailDrawerButton: document.getElementById("closeDetailDrawerButton"),
  detailDrawerTitle: document.getElementById("detailDrawerTitle"),
  detailDrawerContent: document.getElementById("detailDrawerContent"),
  reportModal: document.getElementById("reportModal"),
  reportTitleText: document.getElementById("reportTitleText"),
  reportStage: document.getElementById("reportStage"),
  reportPrintButton: document.getElementById("reportPrintButton"),
  reportPdfButton: document.getElementById("reportPdfButton"),
  reportCloseButton: document.getElementById("reportCloseButton"),
  toastRack: document.getElementById("toastRack")
};

let locationWatchId = null;
let shiftTimerId = null;
let reportContext = null;

async function init() {
  applyTheme();
  restoreAdminSession();
  bindEvents();
  renderStudentIdentity();
  renderLocationSummary("Searching", "Waiting for device GPS.", "info");
  renderClockView();
  renderProgressView();
  renderAdminState();
  startLocationWatch();
  syncLocationMapFields();

  state.rosterLoading = true;
  try {
    const response = await fetchRoster();
    state.roster = response.data || {};
  } catch (error) {
    console.warn("Roster endpoint unavailable, using fallback roster.", error);
    state.roster = ROSTER_FALLBACK;
  } finally {
    state.rosterLoading = false;
    renderStudentIdentity();
    renderClockView();
    renderProgressView();
  }

  if (state.admin.token) {
    loadAdminDashboard();
  }
}

function bindEvents() {
  if (dom.themeToggle) {
    dom.themeToggle.addEventListener("click", toggleTheme);
  }
  dom.navButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewButton));
  });
  dom.studentIdInput.addEventListener("input", debounce(handleStudentLookup, STUDENT_LOOKUP_DEBOUNCE_MS));
  dom.siteSelect.addEventListener("change", handleManualSiteSelection);
  dom.checkInButton.addEventListener("click", () => handleAttendanceAction("Check In"));
  dom.checkOutButton.addEventListener("click", () => handleAttendanceAction("Check Out"));
  dom.clearStudentButton.addEventListener("click", () => clearStudentSession("Student session reset."));

  // Stats modal — Clock tab button
  const statsBtn = document.getElementById("myStatsButton");
  if (statsBtn) {
    statsBtn.addEventListener("click", openStatsModal);
  }
  // Stats modal — My Week tab button
  const progressStatsBtn = document.getElementById("progressStatsButton");
  if (progressStatsBtn) {
    progressStatsBtn.addEventListener("click", openStatsModal);
  }
  const statsModalClose = document.getElementById("statsModalClose");
  if (statsModalClose) {
    statsModalClose.addEventListener("click", closeStatsModal);
  }
  const statsModalOverlay = document.getElementById("statsModal");
  if (statsModalOverlay) {
    statsModalOverlay.addEventListener("click", (e) => {
      if (e.target === statsModalOverlay) closeStatsModal();
    });
  }

  dom.adminLoginButton.addEventListener("click", handleAdminLogin);
  dom.adminPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleAdminLogin();
    }
  });
  dom.adminRefreshButton.addEventListener("click", loadAdminDashboard);
  dom.adminRangeSelect.addEventListener("change", () => {
    state.admin.range = dom.adminRangeSelect.value;
    loadAdminDashboard();
  });
  dom.adminSiteSelect.addEventListener("change", () => {
    state.admin.site = dom.adminSiteSelect.value;
    loadAdminDashboard();
  });
  dom.adminStatusSelect.addEventListener("change", () => {
    state.admin.statusFilter = dom.adminStatusSelect.value;
    renderAdminTables();
  });
  dom.adminSearchInput.addEventListener("input", () => {
    state.admin.search = dom.adminSearchInput.value.trim().toLowerCase();
    renderAdminTables();
  });
  dom.adminCsvButton.addEventListener("click", exportAdminCsv);
  dom.adminLogoutButton.addEventListener("click", () => {
    clearAdminSession();
    showToast("Admin session cleared.", "info");
  });
  dom.adminPrintCohortButton.addEventListener("click", () => openReport("cohort"));
  dom.adminPdfCohortButton.addEventListener("click", async () => {
    await openReport("cohort", { downloadPdfAfterOpen: true });
  });
  if (dom.adminAdvancedDetails) {
    dom.adminAdvancedDetails.addEventListener("toggle", () => {
      if (dom.adminAdvancedDetails.open && state.admin.dashboard) {
        renderHeatmap(dom.adminHeatmap, dom.adminHeatmapLegend, state.admin.dashboard.charts.heatmap || [], "activeStudents");
        renderAdminCharts(state.admin.dashboard);
      }
    });
  }
  dom.closeDetailDrawerButton.addEventListener("click", closeDetailDrawer);
  const drawerOverlay = document.getElementById("drawerOverlay");
  if (drawerOverlay) {
    drawerOverlay.addEventListener("click", closeDetailDrawer);
  }
  dom.reportPrintButton.addEventListener("click", () => openBrowserPrint());
  dom.reportPdfButton.addEventListener("click", async () => {
    try {
      await downloadReportPdf(dom.reportStage, reportFileName());
    } catch (error) {
      showToast(error.message || "Unable to generate PDF.", "danger");
    }
  });
  dom.reportCloseButton.addEventListener("click", closeReportModal);
  dom.reportModal.addEventListener("click", (event) => {
    if (event.target === dom.reportModal) {
      closeReportModal();
    }
  });

  ["click", "keydown", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (state.student.id) {
        armStudentSessionTimeout();
      }
    }, { passive: true });
  });

  // Handle visibility change (backgrounding on mobile)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      // If hidden, wait a short grace period then clear if still hidden
      setTimeout(() => {
        if (document.visibilityState === "hidden" && state.student.id) {
          clearStudentSession("Session cleared for privacy.");
        }
      }, 10000); // 10s grace
    } else if (state.student.id) {
      armStudentSessionTimeout();
    }
  });
}

function applyTheme() {
  // Dark is the default — add theme-light class only when in light mode
  dom.body.classList.toggle("theme-light", state.theme === "light");
  dom.body.classList.remove("theme-dark"); // clean up legacy class if present
  if (dom.themeIndicator) {
    dom.themeIndicator.textContent = state.theme === "dark" ? "Dark" : "Light";
  }
  const sunIcon = document.getElementById("themeIconSun");
  const moonIcon = document.getElementById("themeIconMoon");
  if (sunIcon && moonIcon) {
    // Show sun (switch to light) when currently dark, moon (switch to dark) when currently light
    sunIcon.classList.toggle("is-hidden", state.theme === "light");
    moonIcon.classList.toggle("is-hidden", state.theme === "dark");
  }
}

function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, state.theme);
  applyTheme();
}

function studentCacheKey(studentId, range) {
  return `${studentId}:${range}`;
}

function abortStudentDashboardRequest() {
  if (state.student.requestController) {
    state.student.requestController.abort();
    state.student.requestController = null;
  }
}

function clearStudentPrefetch() {
  clearTimeout(state.student.prefetchTimer);
  state.student.prefetchTimer = null;
}

function renderStudentLoadingState() {
  const loading = Boolean(state.student.loading);
  if (dom.studentLookupLoader) {
    dom.studentLookupLoader.classList.toggle("is-hidden", !loading);
  }
  if (dom.studentLookupLoaderText) {
    dom.studentLookupLoaderText.textContent = state.student.name
      ? `Loading ${state.student.name}'s progress...`
      : "Loading student progress...";
  }
}

function syncStudentDashboard(data, options = {}) {
  if (!data || !data.student) {
    return;
  }
  state.student.dashboard = data;
  state.student.range = "week";
  state.student.loading = false;
  state.student.dashboardCache[studentCacheKey(data.student.studentId || state.student.id, "week")] = data;
  renderStudentLoadingState();
  renderStudentIdentity();
  renderClockView();
  renderProgressView();
  updateStatsButton();
  if (!options.silent) {
    renderClockMessage("Student progress loaded.", "success");
  }
}

function setView(view) {
  state.currentView = view;
  Object.entries(dom.views).forEach(([key, element]) => {
    element.classList.toggle("is-active", key === view);
  });
  dom.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewButton === view);
  });

  // Scroll content to top on view switch
  const appContent = document.querySelector(".app-content");
  if (appContent) {
    appContent.scrollTop = 0;
  }

  if (view === "clock") {
    dom.topbarSummary.textContent = "Use Student Clock for attendance. My Progress stays private to the active student.";
  } else if (view === "progress") {
    dom.topbarSummary.textContent = "My Week shows the active student's weekly points, hours, and the last 7 days of attendance.";
  } else {
    dom.topbarSummary.textContent = "Admin Dashboard shows cohort analytics, exceptions, reports, and printable visuals tied to the Google Sheet backend.";
    if (state.admin.dashboard) {
      window.requestAnimationFrame(() => {
        renderAdminCharts(state.admin.dashboard);
        if (dom.adminAdvancedDetails?.open) {
          renderHeatmap(dom.adminHeatmap, dom.adminHeatmapLegend, state.admin.dashboard.charts.heatmap || [], "activeStudents");
        }
      });
    }
  }
}

function handleStudentLookup() {
  const studentId = dom.studentIdInput.value.trim();
  if (studentId.length < 6) {
    if (state.student.id) {
      clearStudentSession(null, { preserveInput: true, preserveLocation: true });
    }
    return;
  }

  // If roster is still loading, wait a bit and retry
  if (state.rosterLoading) {
    setTimeout(handleStudentLookup, 250);
    return;
  }

  const studentName = state.roster[studentId];
  if (!studentName) {
    state.student.id = studentId;
    state.student.name = "";
    renderStudentIdentity();
    return;
  }

  const isSameStudent = state.student.id === studentId;
  if (isSameStudent && state.student.dashboard) {
    armStudentSessionTimeout();
    return;
  }

  // New student or first lookup
  state.student.id = studentId;
  state.student.name = studentName;
  state.student.loading = true;
  state.student.dashboard = null;
  state.student.dashboardCache = {};
  
  renderStudentIdentity();
  renderStudentLoadingState();
  renderClockMessage("Loading student progress...", "info");
  
  armStudentSessionTimeout();
  loadStudentDashboard();
}

async function loadStudentDashboard(range = state.student.range, options = {}) {
  if (!state.student.id || !state.student.name) {
    return;
  }

  range = "week";

  const requestedStudentId = state.student.id;
  const cacheStore = state.student.dashboardCache;
  const background = Boolean(options.background);
  const cacheKey = studentCacheKey(requestedStudentId, range);
  const cached = options.force ? null : state.student.dashboardCache[cacheKey];

  if (cached) {
    if (!background) {
      syncStudentDashboard(cached, {
        silent: true
      });
    }
    return cached;
  }

  const requestId = background ? state.student.activeRequestId : state.student.activeRequestId + 1;
  if (!background) {
    state.student.activeRequestId = requestId;
  }
  let controller = null;

  if (!background) {
    abortStudentDashboardRequest();
    state.student.loading = true;
    renderStudentLoadingState();
    renderClockView();
    renderProgressView();
    renderClockMessage("Loading student progress...", "info");
    controller = new AbortController();
    state.student.requestController = controller;
  }

  try {
    const response = await fetchStudentDashboard(requestedStudentId, range, {
      signal: controller ? controller.signal : undefined,
      forceFresh: Boolean(options.force)
    });
    const responseStudentId = response.data?.student?.studentId || response.data?.student?.id || requestedStudentId;
    if (requestedStudentId !== responseStudentId || state.student.id !== requestedStudentId) {
      return;
    }
    cacheStore[cacheKey] = response.data;
    if (background) {
      return response.data;
    }
    if (requestId !== state.student.activeRequestId) {
      return;
    }
    syncStudentDashboard(response.data);
  } catch (error) {
    if (error?.name === "AbortError" || error?.code === "REQUEST_ABORTED") {
      return;
    }
    if (!background) {
      state.student.loading = false;
      renderStudentLoadingState();
      if (!state.student.dashboard) {
        renderProgressView();
      }
      renderClockView();
      renderClockMessage(error.message || "Unable to load student progress.", "danger");
    }
  } finally {
    if (!background && state.student.requestController === controller) {
      state.student.requestController = null;
    }
  }
}

function renderStudentIdentity() {
  const hasName = Boolean(state.student.name);
  const hasId = Boolean(state.student.id);
  dom.studentNameValue.textContent = hasName ? state.student.name : hasId ? "ID not found" : "-";
  dom.studentNameCopy.textContent = hasName
    ? state.student.loading
      ? `Student ID ${state.student.id} is loading latest progress.`
      : `Student ID ${state.student.id}`
    : hasId
      ? "That ID is not in the active student roster."
      : "No student loaded.";
  if (dom.progressStudentName && !state.student.dashboard) {
    dom.progressStudentName.textContent = hasName ? state.student.name : "—";
  }
}

function renderClockView() {
  const dashboard = state.student.dashboard;
  const today = dashboard?.today || null;
  const hasStudent = Boolean(state.student.id && state.student.name);
  const hasVerifiedLocation = Boolean(state.student.currentPos && state.student.selectedSite);
  const readyForAction = Boolean(hasStudent && hasVerifiedLocation && !state.student.loading);

  syncLocationMapFields();

  dom.selectedSiteBadge.textContent = state.student.selectedSite ? state.student.selectedSite.name : "Site pending";
  dom.selectedSiteBadge.dataset.tone = state.student.selectedSite ? "success" : "warning";

  if (!hasStudent) {
    syncShiftTimer(null);
    dom.todayHeadline.textContent = "Ready to verify attendance";
    dom.todayCopy.textContent = "Enter your student ID below to check in or out.";
    dom.nextActionBadge.textContent = "Check In";
    dom.nextActionBadge.dataset.tone = "info";
    setPrimaryActionState({
      label: "Check In",
      action: "Check In",
      variant: "checkin",
      disabled: true
    });
    updateActionButtons();
    return;
  }

  if (state.student.loading && !dashboard) {
    syncShiftTimer(null);
    dom.todayHeadline.textContent = `Loading ${state.student.name}…`;
    dom.todayCopy.textContent = "Retrieving this week's attendance and status.";
    dom.nextActionBadge.textContent = "Loading";
    dom.nextActionBadge.dataset.tone = "info";
    setPrimaryActionState({
      label: "Loading…",
      action: "",
      variant: "checkin",
      disabled: true
    });
    updateActionButtons();
    return;
  }

  const todayStatus = normalizeTodayStatus(today);
  syncShiftTimer(today);
  dom.todayHeadline.textContent = studentHeadline(today);
  dom.todayCopy.textContent = studentTodayCopy(today);

  if (todayStatus === "CHECKED_IN") {
    dom.nextActionBadge.textContent = "Check Out";
    dom.nextActionBadge.dataset.tone = "info";
    const readyForCheckout = readyForAction;
    setPrimaryActionState({
      label: "Check Out",
      action: "Check Out",
      variant: "checkout",
      disabled: !readyForCheckout
    });
  } else if (todayStatus === "COMPLETED") {
    dom.nextActionBadge.textContent = "Done";
    dom.nextActionBadge.dataset.tone = "success";
    setPrimaryActionState({
      label: "Done for today",
      action: "",
      variant: "done",
      disabled: true
    });
  } else {
    dom.nextActionBadge.textContent = "Check In";
    dom.nextActionBadge.dataset.tone = todayStatus === "EXCEPTION" ? "danger" : "info";
    setPrimaryActionState({
      label: "Check In",
      action: "Check In",
      variant: "checkin",
      disabled: !readyForAction
    });
  }

  updateActionButtons();
}

function studentHeadline(today) {
  if (!today) return "Ready to verify attendance";
  if (normalizeTodayStatus(today) === "CHECKED_IN") {
    return `Checked in at ${today.checkInTime || formatTimeOnly(today.checkInUtc)}`;
  }
  if (normalizeTodayStatus(today) === "COMPLETED") {
    return `Shift completed at ${today.checkOutTime || formatTimeOnly(today.checkOutUtc)}`;
  }
  if (normalizeTodayStatus(today) === "EXCEPTION") {
    return "Today's shift needs review";
  }
  return "Ready to verify attendance";
}

function studentTodayCopy(today) {
  if (!today) return "Load a student to pull today's status.";
  if (normalizeTodayStatus(today) === "CHECKED_IN") {
    const readyLabel = today.nextEligibleCheckoutAt ? formatCountdownMinutes(today.nextEligibleCheckoutAt) : "Soon";
    return `Checkout unlocks after the one-hour minimum. Next eligible checkout: ${readyLabel}.`;
  }
  if (normalizeTodayStatus(today) === "COMPLETED") {
    return "Both actions have been accepted for today. Weekly totals are already updated.";
  }
  if (normalizeTodayStatus(today) === "EXCEPTION") {
    return "A historical issue exists for today. Admin review may be required.";
  }
  return "No action recorded yet today. Check in to start earning points and logging hours.";
}

function clearShiftTimer() {
  if (shiftTimerId) {
    clearInterval(shiftTimerId);
    shiftTimerId = null;
  }
}

function formatElapsedClock(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function setShiftTimerValue(value) {
  if (!dom.shiftTimerValue) {
    return;
  }
  dom.shiftTimerValue.textContent = value;
}

function syncShiftTimer(today) {
  clearShiftTimer();
  if (!today || !dom.shiftTimerValue) {
    setShiftTimerValue("00:00:00");
    return;
  }

  const status = normalizeTodayStatus(today);
  const checkInMs = today.checkInUtc ? new Date(today.checkInUtc).getTime() : NaN;
  const checkOutMs = today.checkOutUtc ? new Date(today.checkOutUtc).getTime() : NaN;

  if (!Number.isFinite(checkInMs)) {
    setShiftTimerValue("00:00:00");
    return;
  }

  if (status === "COMPLETED" && Number.isFinite(checkOutMs)) {
    setShiftTimerValue(formatElapsedClock(checkOutMs - checkInMs));
    return;
  }

  if (status === "CHECKED_IN") {
    const tick = () => setShiftTimerValue(formatElapsedClock(Date.now() - checkInMs));
    tick();
    shiftTimerId = setInterval(tick, 1000);
    return;
  }

  setShiftTimerValue("00:00:00");
}

function formatCoordinate(value, axis) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  const abs = Math.abs(value).toFixed(4);
  const suffix = axis === "lat"
    ? value >= 0 ? "N" : "S"
    : value >= 0 ? "E" : "W";
  return `${abs}° ${suffix}`;
}

function syncLocationMapFields() {
  if (dom.mapSiteName) {
    dom.mapSiteName.textContent = state.student.selectedSite?.name || "Waiting for approved site match";
  }
  const lat = Number(state.student.currentPos?.lat);
  const lng = Number(state.student.currentPos?.lng);
  if (dom.mapLatValue) {
    dom.mapLatValue.textContent = formatCoordinate(lat, "lat");
  }
  if (dom.mapLngValue) {
    dom.mapLngValue.textContent = formatCoordinate(lng, "lng");
  }
}

function renderProgressView() {
  const { student } = state;
  if (!student.id) {
    dom.progressEmptyState?.classList.remove("is-hidden");
    dom.progressLoadingState?.classList.add("is-hidden");
    dom.progressContent?.classList.add("is-hidden");
    return;
  }
  if (student.loading) {
    dom.progressEmptyState?.classList.add("is-hidden");
    dom.progressLoadingState?.classList.remove("is-hidden");
    dom.progressContent?.classList.add("is-hidden");
    return;
  }

  const data = student.dashboard;
  if (!data) {
    dom.progressEmptyState?.classList.remove("is-hidden");
    dom.progressLoadingState?.classList.add("is-hidden");
    dom.progressContent?.classList.add("is-hidden");
    return;
  }

  dom.progressEmptyState?.classList.add("is-hidden");
  dom.progressLoadingState?.classList.add("is-hidden");
  dom.progressContent?.classList.remove("is-hidden");

  if (dom.progressStudentName) {
    dom.progressStudentName.textContent = getStudentDisplayName(data);
  }

  const weekSummary = getWeekSummary(data);
  if (dom.weekPointsStat) dom.weekPointsStat.textContent = String(weekSummary.totalPoints);
  if (dom.weekHoursStat) dom.weekHoursStat.textContent = String(round(weekSummary.hoursDecimal, 1));

  render7DayHistory(data.recentShifts || []);
}

function render7DayHistory(shifts) {
  if (!dom.sevenDayHistoryList) return;

  const days = buildRecentPacificDays(7);
  const shiftByDate = {};
  shifts.forEach((shift) => {
    if (shift?.localDate && !shiftByDate[shift.localDate]) {
      shiftByDate[shift.localDate] = shift;
    }
  });

  const rows = days.map((dateStr) => {
    const shift = shiftByDate[dateStr];
    const label = formatShortDate(dateStr);
    let eventsHtml = "";

    if (!shift) {
      eventsHtml = `
        <div class="history-event">
          <span class="history-dot none"></span>
          <span style="color: var(--text-tertiary)">No activity</span>
        </div>`;
    } else {
      const checkInTime = shift.checkInUtc ? formatTimeOnly(new Date(shift.checkInUtc)) : null;
      const checkOutTime = shift.checkOutUtc ? formatTimeOnly(new Date(shift.checkOutUtc)) : null;

      if (checkInTime) {
        eventsHtml += `
          <div class="history-event">
            <span class="history-dot checkin"></span>
            <span>Check in · ${escapeHtml(checkInTime)}</span>
          </div>`;
      }
      if (checkOutTime) {
        eventsHtml += `
          <div class="history-event">
            <span class="history-dot checkout"></span>
            <span>Check out · ${escapeHtml(checkOutTime)}</span>
          </div>`;
      } else if (checkInTime) {
        eventsHtml += `
          <div class="history-event">
            <span class="history-dot none"></span>
            <span style="color: var(--text-tertiary)">Still checked in</span>
          </div>`;
      }
    }

    return `
      <div class="history-day-row">
        <div class="history-date">${escapeHtml(label)}</div>
        <div class="history-events">${eventsHtml}</div>
      </div>`;
  });

  dom.sevenDayHistoryList.innerHTML = rows.join("");
}

// ─── STATS MODAL ────────────────────────────────────────────────────────────

function openStatsModal() {
  const modal = document.getElementById("statsModal");
  if (!modal) return;
  populateStatsModal();
  modal.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function closeStatsModal() {
  const modal = document.getElementById("statsModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  document.body.style.overflow = "";
}

function populateStatsModal() {
  const content = document.getElementById("statsModalContent");
  if (!content) return;

  const data = state.student.dashboard;
  if (!data) {
    content.innerHTML = `<div class="stats-modal-empty">No student data loaded. Enter your student ID on the Clock tab first.</div>`;
    return;
  }

  const today = data.today || {};
  const weekSummary = getWeekSummary(data);
  const monthSummary = data.summaries?.month || {};
  const overallSummary = data.summaries?.overall || {};
  const todayStatus = normalizeTodayStatus(today);
  const studentName = getStudentDisplayName(data);

  const statusLabel = {
    "CHECKED_IN": "Checked In",
    "COMPLETED": "Completed",
    "NOT_STARTED": "Not Started",
    "EXCEPTION": "Exception"
  }[todayStatus] || "Not Started";

  const statusToneMap = {
    "CHECKED_IN": "info",
    "COMPLETED": "success",
    "NOT_STARTED": "default",
    "EXCEPTION": "danger"
  };
  const tone = statusToneMap[todayStatus] || "default";

  content.innerHTML = `
    <div class="stats-modal-header">
      <div class="stats-modal-name">${escapeHtml(studentName)}</div>
      <div class="stats-modal-id">ID: ${escapeHtml(state.student.id)}</div>
      <span class="status-pill" data-tone="${tone}" style="margin-top:6px;">${escapeHtml(statusLabel)}</span>
    </div>

    <div class="stats-section-label">Today</div>
    <div class="stats-row-grid">
      <div class="stats-cell">
        <div class="stats-cell-value">${escapeHtml(formatPoints(today.pointsToday || 0))}</div>
        <div class="stats-cell-label">Points Today</div>
      </div>
      <div class="stats-cell">
        <div class="stats-cell-value">${escapeHtml(formatHours(today.hoursToday || 0))}</div>
        <div class="stats-cell-label">Hours Today</div>
      </div>
    </div>

    <div class="stats-section-label">This Week</div>
    <div class="stats-row-grid">
      <div class="stats-cell">
        <div class="stats-cell-value">${escapeHtml(String(weekSummary.totalPoints || 0))}</div>
        <div class="stats-cell-label">Points</div>
      </div>
      <div class="stats-cell">
        <div class="stats-cell-value">${escapeHtml(String(round(weekSummary.hoursDecimal || 0, 1)))}</div>
        <div class="stats-cell-label">Hours</div>
      </div>
    </div>

    <div class="stats-section-label">This Month</div>
    <div class="stats-row-grid">
      <div class="stats-cell">
        <div class="stats-cell-value">${escapeHtml(formatPoints(monthSummary.points || 0))}</div>
        <div class="stats-cell-label">Points</div>
      </div>
      <div class="stats-cell">
        <div class="stats-cell-value">${escapeHtml(formatHours(monthSummary.hours || 0))}</div>
        <div class="stats-cell-label">Hours</div>
      </div>
    </div>

    <div class="stats-section-label">Overall</div>
    <div class="stats-row-grid">
      <div class="stats-cell">
        <div class="stats-cell-value">${escapeHtml(formatPoints(overallSummary.points || 0))}</div>
        <div class="stats-cell-label">Points</div>
      </div>
      <div class="stats-cell">
        <div class="stats-cell-value">${escapeHtml(formatHours(overallSummary.hours || 0))}</div>
        <div class="stats-cell-label">Hours</div>
      </div>
    </div>

    ${today.checkInUtc ? `
    <div class="stats-section-label">Today's Shift</div>
    <div class="stats-shift-detail">
      <div class="stats-shift-row">
        <span class="history-dot checkin" style="margin-right:8px;"></span>
        <span>Check In · ${escapeHtml(formatTimeOnly(new Date(today.checkInUtc)))}</span>
      </div>
      ${today.checkOutUtc ? `
      <div class="stats-shift-row">
        <span class="history-dot checkout" style="margin-right:8px;"></span>
        <span>Check Out · ${escapeHtml(formatTimeOnly(new Date(today.checkOutUtc)))}</span>
      </div>` : `
      <div class="stats-shift-row">
        <span class="history-dot none" style="margin-right:8px;"></span>
        <span style="color:var(--text-secondary)">Waiting for check out</span>
      </div>`}
      ${today.site ? `<div class="stats-shift-site">📍 ${escapeHtml(today.site)}</div>` : ""}
    </div>` : ""}
  `;
}

// Update stats button visibility whenever student state changes
function updateStatsButton() {
  const statsBtn = document.getElementById("myStatsButton");
  if (!statsBtn) return;
  const hasStudent = Boolean(state.student.id && state.student.name);
  statsBtn.classList.toggle("is-hidden", !hasStudent);
}

function updateActionButtonStates({ checkInDisabled = true, checkOutDisabled = true }) {
  if (!dom.checkInButton || !dom.checkOutButton) {
    return;
  }
  dom.checkInButton.disabled = Boolean(checkInDisabled);
  dom.checkOutButton.disabled = Boolean(checkOutDisabled);
}

// Backwards compatibility: setPrimaryActionState now updates individual buttons
function setPrimaryActionState({ label, action, variant, disabled }) {
  // Convert single button state to dual button state
  const actionType = action || variant;
  const isDisabled = Boolean(disabled);

  if (actionType === "Check In") {
    updateActionButtonStates({
      checkInDisabled: isDisabled,
      checkOutDisabled: true  // Cannot check out if checking in
    });
  } else if (actionType === "Check Out") {
    updateActionButtonStates({
      checkInDisabled: true,  // Cannot check in if checking out
      checkOutDisabled: isDisabled
    });
  } else {
    // Loading or done state - disable both
    updateActionButtonStates({
      checkInDisabled: true,
      checkOutDisabled: true
    });
  }
}

function normalizeTodayStatus(today) {
  const rawStatus = String(today?.status || "").toUpperCase();
  if (["COMPLETE", "BACKFILLED_COMPLETE", "COMPLETED"].includes(rawStatus)) {
    return "COMPLETED";
  }
  if (["OPEN", "CHECKED_IN"].includes(rawStatus)) {
    return "CHECKED_IN";
  }
  if (rawStatus === "EXCEPTION") {
    return "EXCEPTION";
  }
  return "NOT_STARTED";
}

function getStudentDisplayName(data) {
  return data?.student?.name || data?.student?.studentName || state.student.name || "—";
}

function getWeekSummary(data) {
  const week = data?.week || data?.summaries?.week || {};
  const selected = data?.currentRange === "week" ? data?.selected || {} : {};
  return {
    totalPoints: Number(week.totalPoints ?? week.points ?? selected.totalPoints ?? selected.points ?? 0),
    hoursDecimal: Number(week.hoursDecimal ?? week.hours ?? selected.hoursDecimal ?? selected.hours ?? 0)
  };
}

function buildRecentPacificDays(count) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const todayParts = formatter.formatToParts(new Date()).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  const pacificMidnight = new Date(Date.UTC(
    Number(todayParts.year),
    Number(todayParts.month) - 1,
    Number(todayParts.day)
  ));
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(pacificMidnight);
    date.setUTCDate(date.getUTCDate() - i);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

function renderRecentShiftsRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="5" class="empty-copy">No shifts yet.</td></tr>`;
  }
  return rows.map((row) => `
    <tr>
      <td>${escapeHtml(formatDate(row.localDate))}</td>
      <td>${escapeHtml(row.site || "-")}</td>
      <td><span class="table-chip" data-tone="${escapeHtml(statusTone(row.status))}">${escapeHtml(row.status || "-")}</span></td>
      <td>${escapeHtml(formatHours(row.hoursDecimal || 0))}</td>
      <td>${escapeHtml(formatPoints(row.totalPoints || 0))}</td>
    </tr>
  `).join("");
}

function renderStudentExceptions(rows) {
  if (!rows.length) {
    return "<div class=\"empty-copy\">No open or exception shifts. Nothing needs student attention right now.</div>";
  }
  return rows.map((row) => `
    <div class="summary-card">
      <div class="stat-label">${escapeHtml(formatDate(row.localDate))}</div>
      <div class="inline-badge" data-tone="${escapeHtml(statusTone(row.status))}">${escapeHtml(row.status)}</div>
      <div class="metric-copy">${escapeHtml(row.message || "Needs review.")}</div>
    </div>
  `).join("");
}

function renderLocationSummary(label, copy, tone = "info") {
  dom.locationStatusBanner.dataset.tone = tone;
  dom.locationStatusBanner.setAttribute("aria-label", label + ": " + copy);
}

function updateLocationBanner(message, tone = "info", siteOptions = null) {
  dom.locationStatusBanner.dataset.tone = tone;
  dom.locationStatusBanner.textContent = message;
  if (siteOptions && siteOptions.length > 1) {
    dom.siteSelectWrap.classList.add("is-visible");
    dom.siteSelect.innerHTML = siteOptions.map((site, index) => `
      <option value="${index}">${escapeHtml(site.name)} (${Math.round(site.distance)}m)</option>
    `).join("");
    const selectedIndex = siteOptions.findIndex((site) => site.name === state.student.selectedSite?.name);
    dom.siteSelect.value = String(selectedIndex >= 0 ? selectedIndex : 0);
  } else {
    dom.siteSelectWrap.classList.remove("is-visible");
    dom.siteSelect.innerHTML = "";
  }
}

function startLocationWatch() {
  if (!navigator.geolocation) {
    renderLocationSummary("Unavailable", "This device does not support geolocation.", "danger");
    updateLocationBanner("Geolocation is not supported on this device.", "danger");
    syncLocationMapFields();
    renderClockView();
    updateActionButtons();
    return;
  }

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      state.student.currentPos = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      validateLocation();
    },
    (error) => {
      renderLocationSummary("Error", error.message || "Location access failed.", "danger");
      updateLocationBanner(`Location error: ${escapeHtml(error.message || "Unable to resolve GPS.")}`, "danger");
      state.student.selectedSite = null;
      state.student.nearbySites = [];
      syncLocationMapFields();
      renderClockView();
      updateActionButtons();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

function validateLocation() {
  if (!state.student.currentPos) {
    return;
  }

  const nearbySites = SITES.map((site) => ({
    ...site,
    distance: haversineMeters(state.student.currentPos.lat, state.student.currentPos.lng, site.lat, site.lng)
  })).filter((site) => site.distance <= ALLOWED_RADIUS_METERS).sort((a, b) => a.distance - b.distance);

  state.student.nearbySites = nearbySites;

  if (!nearbySites.length) {
    state.student.selectedSite = null;
    const nearest = SITES.map((site) => ({
      ...site,
      distance: haversineMeters(state.student.currentPos.lat, state.student.currentPos.lng, site.lat, site.lng)
    })).sort((a, b) => a.distance - b.distance)[0];
    renderLocationSummary("Too far", `Nearest site: ${nearest?.name || "Unknown"} (${Math.round(nearest?.distance || 0)}m).`, "danger");
    updateLocationBanner(`Too far from an approved internship site. Nearest site: ${escapeHtml(nearest?.name || "Unknown")} (${Math.round(nearest?.distance || 0)}m).`, "danger");
    syncLocationMapFields();
    renderClockView();
    updateActionButtons();
    return;
  }

  if (!state.student.selectedSite || !nearbySites.some((site) => site.name === state.student.selectedSite.name)) {
    state.student.selectedSite = nearbySites[0];
  }

  if (nearbySites.length === 1) {
    renderLocationSummary("Verified", `${nearbySites[0].name} (${Math.round(nearbySites[0].distance)}m).`, "success");
    updateLocationBanner(`Location verified for ${escapeHtml(nearbySites[0].name)}. Accuracy window: ${Math.round(nearbySites[0].distance)}m.`, "success");
  } else {
    renderLocationSummary("Multiple sites", "Select the exact internship site from the list.", "warning");
    updateLocationBanner("Multiple approved sites are inside the geofence. Confirm the exact site below before submitting attendance.", "warning", nearbySites);
  }

  renderClockView();
  updateActionButtons();
}

function handleManualSiteSelection() {
  const index = Number(dom.siteSelect.value);
  const site = state.student.nearbySites[index];
  if (site) {
    state.student.selectedSite = site;
    renderClockView();
    updateActionButtons();
  }
}

function updateActionButtons() {
  const ready = Boolean(state.student.id && state.student.name && state.student.currentPos && state.student.selectedSite);
  const todayStatus = normalizeTodayStatus(state.student.dashboard?.today);
  const disableCheckIn = state.student.loading || !ready || ["CHECKED_IN", "COMPLETED"].includes(todayStatus);
  const disableCheckOut = state.student.loading || !ready || ["NOT_STARTED", "COMPLETED"].includes(todayStatus);
  dom.checkInButton.disabled = disableCheckIn;
  dom.checkOutButton.disabled = disableCheckOut;
}

function renderClockMessage(message, tone = "info") {
  dom.clockMessage.textContent = message || "";
  dom.clockMessage.dataset.tone = tone;
}

async function handleAttendanceAction(action) {
  if (!state.student.id || !state.student.name) {
    showToast("Load a student first.", "info");
    return;
  }

  // Check-in + check-out both require live GPS verification at an approved site.
  if (!state.student.currentPos || !state.student.selectedSite) {
    showToast("Location must be verified before submitting attendance.", "danger");
    renderClockMessage("Enable location access and be at an approved internship site.", "danger");
    return;
  }

  // Determine site and coordinates for the submission
  const submissionSite = state.student.selectedSite.name;
  const submissionLat = state.student.currentPos.lat;
  const submissionLng = state.student.currentPos.lng;

  // FIX: Enforce cooldown on the frontend BEFORE attempting submission
  const cooldownReady = state.student.dashboard?.today?.nextEligibleCheckoutAt;
  if (action === "Check Out" && cooldownReady) {
    const remainingMs = new Date(cooldownReady).getTime() - Date.now();
    if (remainingMs > 0) {
      renderClockMessage(`Checkout unlocks in ${formatCountdownMinutes(cooldownReady)}.`, "warning");
      return; // Block early — don't submit if cooldown not met
    }
  }

  const payload = {
    studentId: state.student.id,
    studentName: state.student.name,
    action,
    site: submissionSite,
    lat: submissionLat,
    lng: submissionLng,
    clientTimestamp: new Date().toISOString(),
    userAgent: navigator.userAgent
  };

  try {
    renderClockMessage(`Submitting ${action}…`, "info");
    const response = await submitAttendance(payload);
    const recordedSite = submissionSite || state.student.selectedSite?.name || "";
    rememberLocalAction(action, recordedSite);
    renderClockMessage(`${action} accepted. +${response.pointsDelta} pts.`, "success");
    showToast(`${action} accepted for ${state.student.name}.`, "success");
    await loadStudentDashboard(state.student.range, { force: true });
  } catch (error) {
    const message = mapActionError(error, action);
    renderClockMessage(message, "danger");
    showToast(message, "danger");
    if (error.code === "AUTH_REQUIRED") {
      clearAdminSession();
    }
  }
}

function mapActionError(error, action) {
  if (!error) return `Unable to submit ${action}.`;
  if (error.code === "ALREADY_CHECKED_IN") return "This student already checked in today.";
  if (error.code === "ALREADY_CHECKED_OUT") return "This student already checked out today.";
  if (error.code === "CHECKIN_REQUIRED") return "Check in must happen before check out.";
  if (error.code === "COOLDOWN_NOT_MET") {
    return error.retryAfterMinutes ? `Wait ${error.retryAfterMinutes} more minute(s) before checking out.` : "Wait at least 60 minutes before checking out.";
  }
  return error.message || `Unable to submit ${action}.`;
}

function rememberLocalAction(action, site) {
  const nextItem = {
    timestamp: new Date().toISOString(),
    action,
    site,
    studentName: state.student.name,
    studentId: state.student.id
  };
  state.localHistory = [nextItem].concat(state.localHistory).slice(0, 8);
  writeJsonStorage(localStorage, LOCAL_HISTORY_KEY, state.localHistory);
}

function armStudentSessionTimeout() {
  clearTimeout(state.student.sessionTimer);
  state.student.sessionTimer = setTimeout(() => {
    clearStudentSession("Student session cleared after 90 seconds of inactivity.");
  }, state.student.timeoutMs);
}

function clearStudentSession(message, options = {}) {
  abortStudentDashboardRequest();
  clearStudentPrefetch();
  clearShiftTimer();
  clearTimeout(state.student.sessionTimer);
  const preserveInput = Boolean(options.preserveInput);
  const preserveLocation = Boolean(options.preserveLocation);
  if (!preserveInput) {
    dom.studentIdInput.value = "";
  }
  state.student.id = preserveInput ? dom.studentIdInput.value.trim() : "";
  state.student.name = preserveInput && state.roster[state.student.id] ? state.roster[state.student.id] : "";
  state.student.loading = false;
  state.student.dashboard = null;
  state.student.dashboardCache = {};
  state.student.range = "week";
  state.student.requestController = null;
  if (!preserveLocation) {
    state.student.selectedSite = null;
    state.student.nearbySites = [];
  }
  renderStudentLoadingState();
  renderStudentIdentity();
  renderClockView();
  renderProgressView();
  updateStatsButton();
  closeStatsModal();
  if (message) {
    showToast(message, "info");
    renderClockMessage(message, "info");
  } else {
    renderClockMessage("", "info");
  }
}

async function handleAdminLogin() {
  const password = dom.adminPasswordInput.value;
  if (!password) {
    showToast("Enter the admin password.", "info");
    return;
  }

  try {
    const response = await adminAuth(password);
    state.admin.token = response.token;
    state.admin.expiresAt = response.expiresAt;
    writeJsonStorage(sessionStorage, ADMIN_SESSION_KEY, {
      token: response.token,
      expiresAt: response.expiresAt
    });
    dom.adminPasswordInput.value = "";
    renderAdminState();
    showToast("Admin session started.", "success");
    await loadAdminDashboard();
  } catch (error) {
    showToast(error.message || "Admin sign-in failed.", "danger");
    renderAdminState();
  }
}

function clearAdminSession() {
  state.admin.token = "";
  state.admin.expiresAt = "";
  state.admin.dashboard = null;
  state.admin.loading = false;
  state.admin.error = "";
  state.admin.dataSource = "";
  state.admin.dataQuality = "";
  state.admin.selectedStudent = null;
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  renderAdminState();
}

function renderAdminState() {
  const authenticated = Boolean(state.admin.token && state.admin.expiresAt && new Date(state.admin.expiresAt).getTime() > Date.now());
  dom.adminAuthBadge.textContent = authenticated ? `Signed in until ${formatTimeOnly(state.admin.expiresAt)}` : "Not signed in";
  dom.adminAuthBadge.dataset.tone = authenticated ? "success" : "warning";
  dom.adminLoginState.classList.toggle("is-hidden", authenticated);
  dom.adminContent.classList.toggle("is-hidden", !authenticated);
  if (!authenticated) {
    setAdminNotice("", "info");
  }
  if (!authenticated) {
    closeDetailDrawer();
  }
}

async function loadAdminDashboard(retries = 3) {
  if (!state.admin.token) {
    renderAdminState();
    return;
  }

  state.admin.loading = true;
  state.admin.error = "";
  renderAdminLoadingState(retries < 3 ? "Retrying admin analytics…" : "Loading admin analytics…");

  try {
    const response = await fetchAdminDashboard({
      token: state.admin.token,
      range: state.admin.range,
      site: state.admin.site
    });
    state.admin.dashboard = response.data;
    state.admin.loading = false;
    state.admin.error = "";
    state.admin.dataSource = response?.meta?.source || response?.data?.source || "apps_script";
    state.admin.dataQuality = response?.meta?.dataQuality || response?.data?.dataQuality || "ok";
    populateAdminSiteSelect(response.data.sites || []);
    renderAdminState();
    renderAdminDashboard();
    renderAdminDiagnosticsNotice();
    if (state.admin.selectedStudent) {
      openStudentDetail(state.admin.selectedStudent.studentId);
    }
  } catch (error) {
    state.admin.loading = false;
    if (error.code === "AUTH_REQUIRED") {
      clearAdminSession();
      showToast("Admin session expired. Sign in again.", "danger");
      return;
    }
    
    if (retries > 0) {
      console.warn(`Admin dashboard load failed. Retrying... (${retries} left)`);
      setTimeout(() => loadAdminDashboard(retries - 1), 1000);
      return;
    }

    const message = error.message || "Unable to load admin dashboard.";
    state.admin.error = message;
    renderAdminErrorState(message);
    showToast(message, "danger");
  }
}

function populateAdminSiteSelect(sites) {
  const previous = state.admin.site;
  dom.adminSiteSelect.innerHTML = (sites || ["all"]).map((site) => `
    <option value="${escapeHtml(site)}" ${site === previous ? "selected" : ""}>${escapeHtml(site === "all" ? "All Sites" : site)}</option>
  `).join("");
  if (![...dom.adminSiteSelect.options].some((option) => option.value === previous)) {
    state.admin.site = "all";
    dom.adminSiteSelect.value = "all";
  }
}

function renderAdminDashboard() {
  if (!state.admin.dashboard) {
    return;
  }

  dom.adminRangeSelect.value = state.admin.range;
  dom.adminSiteSelect.value = state.admin.site;
  dom.adminStatusSelect.value = state.admin.statusFilter;
  dom.adminSearchInput.value = state.admin.search;
  dom.adminKpiGrid.innerHTML = adminKpiMarkup(state.admin.dashboard);
  renderAdminTables();
  renderHeatmap(dom.adminHeatmap, dom.adminHeatmapLegend, state.admin.dashboard.charts.heatmap || [], "activeStudents");
  if (state.currentView === "admin") {
    renderAdminCharts(state.admin.dashboard);
  }
  if (!adminDashboardHasActivity(state.admin.dashboard)) {
    renderAdminNoDataState("No analytics data for the current filters yet. Try Overall and All Sites.");
  }
}

function adminDashboardHasActivity(dashboard) {
  if (!dashboard) {
    return false;
  }
  const selected = dashboard.selected || {};
  const selectedHasActivity = [
    selected.pointsTotal,
    selected.hoursTotal,
    selected.completedShifts,
    selected.openShifts,
    selected.exceptionCount,
    selected.activeStudents
  ].some((value) => Number(value || 0) > 0);
  if (selectedHasActivity) {
    return true;
  }

  if ((dashboard.recentShifts || []).length > 0 || (dashboard.exceptions || []).length > 0) {
    return true;
  }

  return (dashboard.leaderboard || []).some((row) => Number(row.points || 0) > 0 || Number(row.hours || 0) > 0);
}

function setAdminNotice(message, tone = "info") {
  if (!dom.adminStateNotice) {
    return;
  }

  dom.adminStateNotice.classList.remove("is-hidden", "error", "success");
  dom.adminStateNotice.textContent = message || "";

  if (!message) {
    dom.adminStateNotice.classList.add("is-hidden");
    return;
  }

  if (tone === "danger") {
    dom.adminStateNotice.classList.add("error");
  } else if (tone === "success") {
    dom.adminStateNotice.classList.add("success");
  }
}

function renderAdminLoadingState(message = "Loading admin analytics…") {
  setAdminNotice(message, "info");
  dom.adminKpiGrid.innerHTML = `
    <div class="loading-row">
      <span class="loading-spinner"></span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  dom.adminStudentsTableBody.innerHTML = `<tr><td colspan="8" class="empty-copy">Loading student analytics…</td></tr>`;
  dom.adminExceptionList.innerHTML = `<div class="empty-copy">Loading exceptions…</div>`;
  dom.auditTrailList.innerHTML = `<div class="empty-copy">Loading audit trail…</div>`;
}

function renderAdminErrorState(message) {
  setAdminNotice(message || "Unable to load admin analytics.", "danger");
  dom.adminKpiGrid.innerHTML = `<div class="empty-copy">${escapeHtml(message || "Unable to load admin analytics.")}</div>`;
  dom.adminStudentsTableBody.innerHTML = `<tr><td colspan="8" class="empty-copy">${escapeHtml(message || "Unable to load student analytics.")}</td></tr>`;
  dom.adminExceptionList.innerHTML = `<div class="empty-copy">No exception data available because the dashboard failed to load.</div>`;
  dom.auditTrailList.innerHTML = `<div class="empty-copy">No audit data available because the dashboard failed to load.</div>`;
}

function renderAdminNoDataState(message) {
  setAdminNotice(message, "info");
}

function renderAdminDiagnosticsNotice() {
  if (state.admin.loading || state.admin.error) {
    return;
  }

  const source = state.admin.dataSource || state.admin.dashboard?.source || "apps_script";
  const quality = state.admin.dataQuality || state.admin.dashboard?.dataQuality || "ok";
  const diagnostics = state.admin.dashboard?.diagnostics || {};
  const shiftRows = Number(diagnostics.shiftRows || 0);

  if (!adminDashboardHasActivity(state.admin.dashboard)) {
    renderAdminNoDataState("No analytics data for the current filters yet. Try Overall and All Sites.");
    return;
  }

  if (source === "sheet_fallback" && quality !== "ok") {
    const copy = shiftRows > 0
      ? `Analytics recovered from Google Sheet fallback (${shiftRows} shift rows).`
      : "Analytics recovered from Google Sheet fallback.";
    setAdminNotice(copy, "success");
    return;
  }

  if (quality === "suspect_zeroed_backend") {
    setAdminNotice("Apps Script returned a zeroed payload while sheet rows exist. Refresh after redeploying Apps Script.", "danger");
    return;
  }

  if (quality !== "ok" && quality !== "empty_dataset") {
    setAdminNotice(`Analytics quality status: ${quality}.`, "info");
    return;
  }

  setAdminNotice("", "info");
}

function adminKpiMarkup(dashboard) {
  const selected = dashboard.selected || {};
  const today = dashboard.today || {};
  return [
    { label: "Active Today", value: String(today.activeStudents || 0), copy: "Students with any shift activity today." },
    { label: "Completed Today", value: String(today.completedShifts || 0), copy: "Students who fully completed today's shift." },
    { label: "Open Shifts", value: String(selected.openShifts || 0), copy: "Selected range shifts still missing checkout." },
    { label: `${toRangeLabel(state.admin.range)} Points`, value: formatPoints(selected.pointsTotal || 0), copy: `${selected.topStudentName || "No benchmark yet"} leads the cohort.` },
    { label: `${toRangeLabel(state.admin.range)} Hours`, value: formatHours(selected.hoursTotal || 0), copy: `${formatHours(selected.topHours || 0)} is the top benchmark.` },
    { label: "Exceptions", value: String(selected.exceptionCount || 0), copy: "Historical or live shifts needing review." }
  ].map((card) => `
    <div class="metric-card" data-tone="brand">
      <div class="stat-label">${escapeHtml(card.label)}</div>
      <div class="metric-value">${escapeHtml(card.value)}</div>
      <div class="metric-copy">${escapeHtml(card.copy)}</div>
    </div>
  `).join("");
}

function renderAdminTables() {
  if (!state.admin.dashboard) {
    return;
  }
  const filteredRows = getFilteredAdminRows();
  dom.adminStudentsTableBody.innerHTML = filteredRows.length
    ? filteredRows.map((row) => adminStudentRowMarkup(row)).join("")
    : `<tr><td colspan="8" class="empty-copy">No students match the current filters.</td></tr>`;

  Array.from(dom.adminStudentsTableBody.querySelectorAll("[data-student-detail]")).forEach((button) => {
    button.addEventListener("click", () => openStudentDetail(button.dataset.studentDetail));
  });

  const filteredExceptions = filterAdminExceptions();
  dom.adminExceptionList.innerHTML = filteredExceptions.length
    ? filteredExceptions.map((row) => `
      <div class="summary-card">
        <div class="stat-label">${escapeHtml(formatDate(row.localDate))}</div>
        <div><strong>${escapeHtml(row.studentName)}</strong></div>
        <div class="inline-badge" data-tone="${escapeHtml(statusTone(row.status))}">${escapeHtml(row.status)}</div>
        <div class="metric-copy">${escapeHtml(row.message)}</div>
      </div>
    `).join("")
    : `<div class="empty-copy">No open or exception shifts for the current filters.</div>`;

  const auditEntries = state.admin.dashboard.auditTrail || [];
  dom.auditTrailList.innerHTML = auditEntries.length
    ? auditEntries.map((row) => `
      <div class="summary-card">
        <div class="stat-label">${escapeHtml(formatDateTime(row.timestampUtc))}</div>
        <div><strong>${escapeHtml(row.outcomeCode)}</strong></div>
        <div class="metric-copy">${escapeHtml(row.message)}</div>
        <div class="metric-copy">${escapeHtml(row.studentId || row.actorType)}</div>
      </div>
    `).join("")
    : `<div class="empty-copy">No audit events in the current range.</div>`;
}

function getFilteredAdminRows() {
  const rows = state.admin.dashboard?.students || [];
  return rows.filter((row) => {
    const selected = row[state.admin.range] || row.overall;
    const searchHaystack = `${row.studentName} ${row.studentId}`.toLowerCase();
    if (state.admin.search && !searchHaystack.includes(state.admin.search)) {
      return false;
    }

    if (state.admin.statusFilter === "all") {
      return true;
    }
    if (state.admin.statusFilter === "complete") {
      return ["COMPLETE", "BACKFILLED_COMPLETE"].includes(selected.shiftStatus);
    }
    if (state.admin.statusFilter === "open") {
      return selected.shiftStatus === "OPEN";
    }
    if (state.admin.statusFilter === "exception") {
      return selected.shiftStatus === "EXCEPTION";
    }
    return true;
  });
}

function adminStudentRowMarkup(row) {
  const selected = row[state.admin.range] || row.overall;
  return `
    <tr>
      <td>
        <button class="table-link" data-student-detail="${escapeHtml(row.studentId)}">${escapeHtml(row.studentName)}</button>
        <div class="metric-copy">${escapeHtml(row.studentId)}</div>
      </td>
      <td>${escapeHtml(formatPoints(row.week.points || 0))}<br><span class="metric-copy">${escapeHtml(formatHours(row.week.hours || 0))}</span></td>
      <td>${escapeHtml(formatPoints(row.month.points || 0))}<br><span class="metric-copy">${escapeHtml(formatHours(row.month.hours || 0))}</span></td>
      <td>${escapeHtml(formatPoints(row.overall.points || 0))}<br><span class="metric-copy">${escapeHtml(formatHours(row.overall.hours || 0))}</span></td>
      <td>${escapeHtml(formatPercent(selected.pointsPctOfTop || 0))} pts<br><span class="metric-copy">${escapeHtml(formatPercent(selected.hoursPctOfTop || 0))} hrs</span></td>
      <td>${escapeHtml(formatPercent(selected.percentile || 0))}</td>
      <td>${escapeHtml(formatDateTime(selected.lastActivityUtc))}</td>
      <td><span class="table-chip" data-tone="${escapeHtml(statusTone(selected.shiftStatus))}">${escapeHtml(selected.shiftStatus || "NOT_STARTED")}</span></td>
    </tr>
  `;
}

function filterAdminExceptions() {
  const rows = state.admin.dashboard?.exceptions || [];
  return rows.filter((row) => {
    const haystack = `${row.studentName} ${row.studentId}`.toLowerCase();
    return !state.admin.search || haystack.includes(state.admin.search);
  }).slice(0, 12);
}

async function openStudentDetail(studentId) {
  state.admin.selectedStudent = { studentId };
  dom.detailDrawer.classList.add("is-open");
  const overlay = document.getElementById("drawerOverlay");
  if (overlay) overlay.classList.add("is-active");
  dom.detailDrawerTitle.textContent = "Loading student detail...";
  dom.detailDrawerContent.innerHTML = "<div class=\"empty-copy\">Fetching detailed student analytics and report actions.</div>";

  try {
    const response = await fetchStudentDashboard(studentId, state.admin.range);
    const detail = response.data;
    state.admin.selectedStudent = detail.student;
    dom.detailDrawerTitle.textContent = detail.student.studentName;
    dom.detailDrawerContent.innerHTML = detailDrawerMarkup(detail);
    dom.detailDrawerContent.querySelector("[data-detail-print]")?.addEventListener("click", () => openReport("student", { studentId }));
    dom.detailDrawerContent.querySelector("[data-detail-pdf]")?.addEventListener("click", async () => {
      await openReport("student", { studentId, downloadPdfAfterOpen: true });
    });
    renderDetailCharts(detail);
  } catch (error) {
    dom.detailDrawerTitle.textContent = "Student detail unavailable";
    dom.detailDrawerContent.innerHTML = `<div class="empty-copy">${escapeHtml(error.message || "Unable to load student detail.")}</div>`;
  }
}

function detailDrawerMarkup(detail) {
  const selected = detail.selected || {};
  return `
    <div class="summary-grid">
      <div class="summary-card"><div class="stat-label">${escapeHtml(toRangeLabel(detail.currentRange))} Points</div><div class="metric-value">${escapeHtml(formatPoints(selected.points || 0))}</div></div>
      <div class="summary-card"><div class="stat-label">${escapeHtml(toRangeLabel(detail.currentRange))} Hours</div><div class="metric-value">${escapeHtml(formatHours(selected.hours || 0))}</div></div>
      <div class="summary-card"><div class="stat-label">Percentile</div><div class="metric-value">${escapeHtml(formatPercent(selected.percentile || 0))}</div></div>
      <div class="summary-card"><div class="stat-label">Today</div><div class="metric-value">${escapeHtml(detail.today.status || "NOT_STARTED")}</div></div>
    </div>
    <div class="button-row">
      <button class="button is-secondary" data-detail-print type="button">Print Student Report</button>
      <button class="button is-accent" data-detail-pdf type="button">Download Student PDF</button>
    </div>
    <section class="chart-card is-short">
      <div class="card-header"><div><div class="card-label">Week</div><h3 class="card-title">Weekly points</h3></div></div>
      <canvas id="detailWeeklyPointsChart"></canvas>
    </section>
    <section class="chart-card is-short">
      <div class="card-header"><div><div class="card-label">Current range</div><h3 class="card-title">Cumulative points</h3></div></div>
      <canvas id="detailCumulativeChart"></canvas>
    </section>
    <section class="surface">
      <div class="card-header"><div><div class="card-label">Recent Shifts</div><h3 class="card-title">Detail log</h3></div></div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Site</th><th>Status</th><th>Hours</th><th>Points</th></tr></thead>
          <tbody>${renderRecentShiftsRows(detail.recentShifts || [])}</tbody>
        </table>
      </div>
    </section>
    <section class="surface">
      <div class="card-header"><div><div class="card-label">Exceptions</div><h3 class="card-title">Open items</h3></div></div>
      <div class="action-stack">${renderStudentExceptions(detail.exceptions || [])}</div>
    </section>
  `;
}

function closeDetailDrawer() {
  dom.detailDrawer.classList.remove("is-open");
  const overlay = document.getElementById("drawerOverlay");
  if (overlay) overlay.classList.remove("is-active");
}

function renderHeatmap(container, legend, series, valueKey) {
  if (!container || !legend) return;
  if (!series.length) {
    legend.innerHTML = "<span>No activity in the selected period.</span>";
    container.innerHTML = "<div class=\"empty-copy\">No heatmap data yet.</div>";
    return;
  }

  legend.innerHTML = `<span>Lower</span><span class="legend-chip">Intensity based on ${escapeHtml(valueKey)}</span><span>Higher</span>`;
  container.innerHTML = series.slice(-18).map((row) => {
    const intensity = Math.max(0, Math.min(100, Number(row.intensity) || 0));
    const alpha = intensity === 0 ? 0.08 : 0.18 + intensity / 160;
    const background = valueKey === "activeStudents"
      ? `rgba(48, 209, 88, ${alpha})`
      : `rgba(10, 132, 255, ${alpha})`;
    const value = valueKey === "activeStudents"
      ? `${row.activeStudents || 0} active`
      : `${row.points || 0} pts`;
    return `
      <div class="heatmap-cell" data-intensity="${escapeHtml(String(Math.round(intensity)))}" style="background:${background};">
        <div class="heatmap-day">${escapeHtml(formatShortDate(row.date))}</div>
        <div class="heatmap-value">${escapeHtml(value)}</div>
      </div>
    `;
  }).join("");
}

function exportAdminCsv() {
  const rows = getFilteredAdminRows();
  const headers = [
    "Student",
    "Student ID",
    "Week Points",
    "Week Hours",
    "Month Points",
    "Month Hours",
    "Overall Points",
    "Overall Hours",
    `${toRangeLabel(state.admin.range)} Points % of Top`,
    `${toRangeLabel(state.admin.range)} Hours % of Top`,
    `${toRangeLabel(state.admin.range)} Percentile`,
    "Last Activity",
    "Status"
  ];

  const csvRows = rows.map((row) => {
    const selected = row[state.admin.range] || row.overall;
    return [
      row.studentName,
      row.studentId,
      row.week.points,
      row.week.hours,
      row.month.points,
      row.month.hours,
      row.overall.points,
      row.overall.hours,
      selected.pointsPctOfTop,
      selected.hoursPctOfTop,
      selected.percentile,
      selected.lastActivityUtc,
      selected.shiftStatus
    ];
  });

  downloadCsv(`intern-track-${state.admin.range}-${state.admin.site}.csv`, headers, csvRows);
}

async function openReport(type, options = {}) {
  if (!state.admin.token) {
    showToast("Admin sign-in is required for reports.", "danger");
    return;
  }

  try {
    const response = await fetchReportData({
      token: state.admin.token,
      type,
      range: state.admin.range,
      site: state.admin.site,
      studentId: options.studentId || ""
    });
    reportContext = response.data;
    dom.reportTitleText.textContent = `${response.data.reportTitle} - ${response.data.reportSubtitle}`;
    dom.reportStage.innerHTML = renderReportMarkup(response.data);
    dom.reportModal.classList.add("is-open");
    if (options.downloadPdfAfterOpen) {
      await downloadReportPdf(dom.reportStage, reportFileName());
    }
  } catch (error) {
    if (error.code === "AUTH_REQUIRED") {
      clearAdminSession();
    }
    showToast(error.message || "Unable to open report.", "danger");
  }
}

function closeReportModal() {
  dom.reportModal.classList.remove("is-open");
}

function reportFileName() {
  if (!reportContext) {
    return "intern-track-report.pdf";
  }
  const base = `${reportContext.type}-${state.admin.range}-${state.admin.site}`.replace(/\s+/g, "-").toLowerCase();
  return `${base}.pdf`;
}

function showToast(message, tone = "info") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.tone = tone;
  toast.innerHTML = `<div class="toast-copy">${escapeHtml(message)}</div>`;
  dom.toastRack.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

window.addEventListener("beforeunload", () => {
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
  }
});

init();

// Testing hooks
if (typeof window !== "undefined") {
  window.__internState = state;
  window.__internRender = () => {
    renderClockView();
    renderProgressView();
    renderAdminState();
  };
}
