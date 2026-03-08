import {
  ADMIN_SESSION_KEY,
  LOCAL_HISTORY_KEY,
  RANGE_OPTIONS,
  STATUS_FILTER_OPTIONS,
  STUDENT_DB,
  SITES,
  ALLOWED_RADIUS_METERS,
  THEME_KEY
} from "./config.js";
import { adminAuth, fetchAdminDashboard, fetchReportData, fetchStudentDashboard, submitAttendance } from "./api.js";
import { renderAdminCharts, renderDetailCharts, renderStudentCharts } from "./charts.js";
import { downloadReportPdf, openBrowserPrint, renderReportMarkup } from "./reports.js";
import { restoreAdminSession, state } from "./state.js";
import {
  computeGaugeDash,
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
  percentileLabel,
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
  studentNameValue: document.getElementById("studentNameValue"),
  studentNameCopy: document.getElementById("studentNameCopy"),
  sidebarStudentName: document.getElementById("sidebarStudentName"),
  sidebarStudentMeta: document.getElementById("sidebarStudentMeta"),
  sidebarLocationStatus: document.getElementById("sidebarLocationStatus"),
  sidebarLocationMeta: document.getElementById("sidebarLocationMeta"),
  studentSessionBadge: document.getElementById("studentSessionBadge"),
  locationStatusBanner: document.getElementById("locationStatusBanner"),
  siteSelectWrap: document.getElementById("siteSelectWrap"),
  siteSelect: document.getElementById("siteSelect"),
  checkInButton: document.getElementById("checkInButton"),
  checkOutButton: document.getElementById("checkOutButton"),
  clearStudentButton: document.getElementById("clearStudentButton"),
  jumpToProgressButton: document.getElementById("jumpToProgressButton"),
  clockMessage: document.getElementById("clockMessage"),
  clockStatusBadge: document.getElementById("clockStatusBadge"),
  todayHeadline: document.getElementById("todayHeadline"),
  todayCopy: document.getElementById("todayCopy"),
  nextActionBadge: document.getElementById("nextActionBadge"),
  selectedSiteBadge: document.getElementById("selectedSiteBadge"),
  todayPointsStat: document.getElementById("todayPointsStat"),
  todayHoursStat: document.getElementById("todayHoursStat"),
  clockQuickStats: document.getElementById("clockQuickStats"),
  localHistoryList: document.getElementById("localHistoryList"),
  progressEmptyState: document.getElementById("progressEmptyState"),
  progressContent: document.getElementById("progressContent"),
  rangeButtons: Array.from(document.querySelectorAll("[data-range-button]")),
  progressStudentName: document.getElementById("progressStudentName"),
  progressPercentileBadge: document.getElementById("progressPercentileBadge"),
  progressRangeBadge: document.getElementById("progressRangeBadge"),
  progressSummaryCards: document.getElementById("progressSummaryCards"),
  gaugeGrid: document.getElementById("gaugeGrid"),
  studentHeatmap: document.getElementById("studentHeatmap"),
  studentHeatmapLegend: document.getElementById("studentHeatmapLegend"),
  recentShiftsTableBody: document.getElementById("recentShiftsTableBody"),
  studentExceptionsList: document.getElementById("studentExceptionsList"),
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
  adminKpiGrid: document.getElementById("adminKpiGrid"),
  adminStudentsTableBody: document.getElementById("adminStudentsTableBody"),
  adminExceptionList: document.getElementById("adminExceptionList"),
  adminHeatmap: document.getElementById("adminHeatmap"),
  adminHeatmapLegend: document.getElementById("adminHeatmapLegend"),
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
let reportContext = null;

function init() {
  applyTheme();
  restoreAdminSession();
  bindEvents();
  renderLocalHistory();
  renderStudentIdentity();
  renderLocationSummary("Searching", "Waiting for device GPS.", "info");
  renderClockView();
  renderProgressView();
  renderAdminState();
  startLocationWatch();
  if (state.admin.token) {
    loadAdminDashboard();
  }
}

function bindEvents() {
  dom.themeToggle.addEventListener("click", toggleTheme);
  dom.navButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewButton));
  });
  dom.studentIdInput.addEventListener("input", debounce(handleStudentLookup, 200));
  dom.siteSelect.addEventListener("change", handleManualSiteSelection);
  dom.checkInButton.addEventListener("click", () => handleAttendanceAction("Check In"));
  dom.checkOutButton.addEventListener("click", () => handleAttendanceAction("Check Out"));
  dom.clearStudentButton.addEventListener("click", () => clearStudentSession("Student session reset."));
  dom.jumpToProgressButton.addEventListener("click", () => {
    if (!state.student.id) {
      showToast("Load a student first.", "info");
      return;
    }
    setView("progress");
  });
  dom.rangeButtons.forEach((button) => {
    button.addEventListener("click", () => setStudentRange(button.dataset.rangeButton));
  });
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
  dom.closeDetailDrawerButton.addEventListener("click", closeDetailDrawer);
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
}

function applyTheme() {
  dom.body.classList.toggle("theme-light", state.theme === "light");
  dom.themeIndicator.textContent = state.theme === "light" ? "Light" : "Dark";
}

function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, state.theme);
  applyTheme();
}

function setView(view) {
  state.currentView = view;
  Object.entries(dom.views).forEach(([key, element]) => {
    element.classList.toggle("is-active", key === view);
  });
  dom.navButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewButton === view);
  });

  if (view === "clock") {
    dom.topbarSummary.textContent = "Use Student Clock for attendance. My Progress stays private to the active student.";
  } else if (view === "progress") {
    dom.topbarSummary.textContent = "My Progress shows private points, hours, percentile, and benchmark standing for the active student only.";
  } else {
    dom.topbarSummary.textContent = "Admin Dashboard shows cohort analytics, exceptions, reports, and printable visuals tied to the Google Sheet backend.";
  }
}

function handleStudentLookup() {
  const studentId = dom.studentIdInput.value.trim();
  if (studentId.length < 6) {
    clearStudentSession(null, { preserveInput: true, preserveLocation: true });
    renderStudentIdentity();
    renderProgressView();
    renderClockView();
    return;
  }

  const studentName = STUDENT_DB[studentId];
  if (!studentName) {
    state.student.id = studentId;
    state.student.name = "";
    state.student.dashboard = null;
    renderStudentIdentity();
    renderProgressView();
    renderClockView();
    return;
  }

  if (state.student.id === studentId && state.student.dashboard) {
    armStudentSessionTimeout();
    renderStudentIdentity();
    renderClockView();
    return;
  }

  state.student.id = studentId;
  state.student.name = studentName;
  renderStudentIdentity();
  renderClockMessage("Loading student progress...", "info");
  armStudentSessionTimeout();
  loadStudentDashboard();
}

async function loadStudentDashboard(range = state.student.range) {
  if (!state.student.id || !state.student.name) {
    return;
  }

  try {
    const response = await fetchStudentDashboard(state.student.id, range);
    if (state.student.id !== response.data.student.studentId) {
      return;
    }
    state.student.dashboard = response.data;
    state.student.range = response.data.currentRange;
    renderClockView();
    renderProgressView();
    renderClockMessage("Student progress loaded.", "info");
  } catch (error) {
    state.student.dashboard = null;
    renderProgressView();
    renderClockMessage(error.message || "Unable to load student progress.", "danger");
  }
}

function renderStudentIdentity() {
  const hasName = Boolean(state.student.name);
  const hasId = Boolean(state.student.id);
  dom.studentNameValue.textContent = hasName ? state.student.name : hasId ? "ID not found" : "-";
  dom.studentNameCopy.textContent = hasName
    ? `Student ID ${state.student.id}`
    : hasId
      ? "That ID is not in the active student roster."
      : "No student loaded.";
  dom.sidebarStudentName.textContent = hasName ? state.student.name : "-";
  dom.sidebarStudentMeta.textContent = hasName
    ? `ID ${state.student.id} is the active private session.`
    : hasId
      ? "Unknown student ID."
      : "Enter a 6-digit ID to load progress.";
  dom.studentSessionBadge.textContent = hasName ? "Student loaded" : "No student loaded";
  dom.studentSessionBadge.dataset.tone = hasName ? "success" : "info";
}

function renderClockView() {
  const dashboard = state.student.dashboard;
  const today = dashboard?.today;

  if (!state.student.id || !state.student.name || !dashboard) {
    dom.clockStatusBadge.textContent = state.student.name ? "Loading" : "Waiting for student";
    dom.clockStatusBadge.dataset.tone = state.student.name ? "info" : "info";
    dom.todayHeadline.textContent = state.student.name ? `Loading ${state.student.name}...` : "Ready to verify attendance";
    dom.todayCopy.textContent = state.student.name
      ? "Pulling current points, hours, and today's attendance status."
      : "Enter a student ID and confirm location to unlock check-in and check-out.";
    dom.nextActionBadge.textContent = "Next action: Check In";
    dom.nextActionBadge.dataset.tone = "info";
    dom.selectedSiteBadge.textContent = state.student.selectedSite ? `Site: ${state.student.selectedSite.name}` : "Site pending";
    dom.selectedSiteBadge.dataset.tone = state.student.selectedSite ? "success" : "warning";
    dom.todayPointsStat.textContent = "0 pts";
    dom.todayHoursStat.textContent = "0 hrs";
    dom.clockQuickStats.innerHTML = defaultClockQuickStatsMarkup();
    updateActionButtons();
    return;
  }

  dom.clockStatusBadge.textContent = today?.status || "NOT_STARTED";
  dom.clockStatusBadge.dataset.tone = statusTone(today?.status || "NOT_STARTED");
  dom.todayHeadline.textContent = studentHeadline(today);
  dom.todayCopy.textContent = studentTodayCopy(today);
  dom.nextActionBadge.textContent = `Next action: ${today?.nextAction || "Check In"}`;
  dom.nextActionBadge.dataset.tone = statusTone(today?.status || "NOT_STARTED");
  dom.selectedSiteBadge.textContent = state.student.selectedSite ? `Site: ${state.student.selectedSite.name}` : "Site pending";
  dom.selectedSiteBadge.dataset.tone = state.student.selectedSite ? "success" : "warning";
  dom.todayPointsStat.textContent = formatPoints(today?.pointsToday || 0);
  dom.todayHoursStat.textContent = formatHours(today?.hoursToday || 0);
  dom.clockQuickStats.innerHTML = quickStatsMarkup(dashboard);
  updateActionButtons();
}

function defaultClockQuickStatsMarkup() {
  return [
    { label: "Overall Points", value: "0 pts", copy: "Load a student to see live totals." },
    { label: "Overall Hours", value: "0 hrs", copy: "Derived from completed valid shifts." },
    { label: "Points vs Top", value: "0%", copy: "Top student defines the 100% benchmark." },
    { label: "Hours vs Top", value: "0%", copy: "Top logged hours define the 100% benchmark." }
  ].map((card) => `
    <div class="metric-card">
      <div class="stat-label">${escapeHtml(card.label)}</div>
      <div class="metric-value">${escapeHtml(card.value)}</div>
      <div class="metric-copy">${escapeHtml(card.copy)}</div>
    </div>
  `).join("");
}

function quickStatsMarkup(dashboard) {
  const overall = dashboard?.summaries?.overall || {};
  return [
    {
      label: "Overall Points",
      value: formatPoints(overall.points || 0),
      copy: `${round(overall.completedShifts || 0)} completed shifts.`
    },
    {
      label: "Overall Hours",
      value: formatHours(overall.hours || 0),
      copy: `${round(overall.openShifts || 0)} open shifts / ${round(overall.exceptionCount || 0)} exceptions.`
    },
    {
      label: "Points vs Top",
      value: formatPercent(overall.pointsPctOfTop || 0),
      copy: `Gap: ${formatPoints(overall.gapToTopPoints || 0)}`
    },
    {
      label: "Hours vs Top",
      value: formatPercent(overall.hoursPctOfTop || 0),
      copy: `Gap: ${formatHours(overall.gapToTopHours || 0)}`
    }
  ].map((card) => `
    <div class="metric-card" data-tone="brand">
      <div class="stat-label">${escapeHtml(card.label)}</div>
      <div class="metric-value">${escapeHtml(card.value)}</div>
      <div class="metric-copy">${escapeHtml(card.copy)}</div>
    </div>
  `).join("");
}

function studentHeadline(today) {
  if (!today) return "Student ready";
  if (today.status === "CHECKED_IN") {
    return `Checked in at ${formatTimeOnly(today.checkInUtc)}`;
  }
  if (today.status === "COMPLETED") {
    return `Shift completed at ${formatTimeOnly(today.checkOutUtc)}`;
  }
  if (today.status === "EXCEPTION") {
    return "Today's shift needs review";
  }
  return "Ready to verify attendance";
}

function studentTodayCopy(today) {
  if (!today) return "Load a student to pull today's status.";
  if (today.status === "CHECKED_IN") {
    const readyLabel = today.nextEligibleCheckoutAt ? formatCountdownMinutes(today.nextEligibleCheckoutAt) : "Soon";
    return `Checkout unlocks after the one-hour minimum. Next eligible checkout: ${readyLabel}.`;
  }
  if (today.status === "COMPLETED") {
    return "Both actions have been accepted for today. Hours and points are already reflected in progress analytics.";
  }
  if (today.status === "EXCEPTION") {
    return "A historical issue exists for today. Admin review may be required.";
  }
  return "No action recorded yet today. Check in to start earning points and logging hours.";
}

function renderProgressView() {
  const dashboard = state.student.dashboard;
  if (!state.student.id || !state.student.name || !dashboard) {
    dom.progressEmptyState.classList.remove("is-hidden");
    dom.progressContent.classList.add("is-hidden");
    return;
  }

  dom.progressEmptyState.classList.add("is-hidden");
  dom.progressContent.classList.remove("is-hidden");
  dom.progressStudentName.textContent = dashboard.student.studentName;
  dom.progressPercentileBadge.textContent = percentileLabel(dashboard.selected.percentile || 0);
  dom.progressPercentileBadge.dataset.tone = "info";
  dom.progressRangeBadge.textContent = toRangeLabel(dashboard.currentRange);

  dom.rangeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rangeButton === dashboard.currentRange);
  });

  dom.progressSummaryCards.innerHTML = RANGE_OPTIONS.map((range) => {
    const summary = dashboard.summaries[range] || {};
    return `
      <div class="summary-card">
        <div class="stat-label">${escapeHtml(toRangeLabel(range))}</div>
        <div class="metric-value">${escapeHtml(formatPoints(summary.points || 0))}</div>
        <div class="metric-copy">${escapeHtml(formatHours(summary.hours || 0))}</div>
        <div class="metric-copy">${escapeHtml(formatPercent(summary.pointsPctOfTop || 0))} points / ${escapeHtml(formatPercent(summary.hoursPctOfTop || 0))} hours vs top</div>
      </div>
    `;
  }).join("");

  dom.gaugeGrid.innerHTML = gaugeMarkup(dashboard.selected);
  dom.recentShiftsTableBody.innerHTML = renderRecentShiftsRows(dashboard.recentShifts || []);
  dom.studentExceptionsList.innerHTML = renderStudentExceptions(dashboard.exceptions || []);
  renderHeatmap(dom.studentHeatmap, dom.studentHeatmapLegend, dashboard.charts.heatmap || [], "points");
  renderStudentCharts(dashboard);
}

function gaugeMarkup(summary) {
  const pointGauge = computeGaugeDash(summary.pointsPctOfTop || 0);
  const hourGauge = computeGaugeDash(summary.hoursPctOfTop || 0);
  return `
    <div class="gauge-card">
      <div class="card-label">Points benchmark</div>
      <div class="gauge-shell">
        <svg class="gauge-svg" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="gauge-track" cx="60" cy="60" r="46"></circle>
          <circle class="gauge-progress" cx="60" cy="60" r="46" stroke-dasharray="${pointGauge.circumference}" stroke-dashoffset="${pointGauge.offset}"></circle>
        </svg>
        <div class="gauge-meta">
          <div class="gauge-value">${escapeHtml(formatPercent(summary.pointsPctOfTop || 0))}</div>
          <div class="metric-copy">${escapeHtml(formatPoints(summary.points || 0))} earned in ${escapeHtml(toRangeLabel(state.student.range).toLowerCase())}</div>
          <div class="metric-copy">Gap to top: ${escapeHtml(formatPoints(summary.gapToTopPoints || 0))}</div>
        </div>
      </div>
    </div>
    <div class="gauge-card">
      <div class="card-label">Hours benchmark</div>
      <div class="gauge-shell">
        <svg class="gauge-svg" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="gauge-track" cx="60" cy="60" r="46"></circle>
          <circle class="gauge-progress" data-tone="hours" cx="60" cy="60" r="46" stroke-dasharray="${hourGauge.circumference}" stroke-dashoffset="${hourGauge.offset}"></circle>
        </svg>
        <div class="gauge-meta">
          <div class="gauge-value">${escapeHtml(formatPercent(summary.hoursPctOfTop || 0))}</div>
          <div class="metric-copy">${escapeHtml(formatHours(summary.hours || 0))} logged in ${escapeHtml(toRangeLabel(state.student.range).toLowerCase())}</div>
          <div class="metric-copy">Gap to top: ${escapeHtml(formatHours(summary.gapToTopHours || 0))}</div>
        </div>
      </div>
    </div>
  `;
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
  dom.sidebarLocationStatus.textContent = label;
  dom.sidebarLocationMeta.textContent = copy;
  dom.locationStatusBanner.dataset.tone = tone;
}

function updateLocationBanner(message, tone = "info", siteOptions = null) {
  dom.locationStatusBanner.dataset.tone = tone;
  dom.locationStatusBanner.innerHTML = `<div>${message}</div>`;
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
  const ready = Boolean(state.student.id && state.student.name && state.student.selectedSite);
  const todayStatus = state.student.dashboard?.today?.status || "NOT_STARTED";
  const disableCheckIn = !ready || ["CHECKED_IN", "COMPLETED"].includes(todayStatus);
  const disableCheckOut = !ready || ["NOT_STARTED", "COMPLETED"].includes(todayStatus);
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

  if (!state.student.currentPos || !state.student.selectedSite) {
    showToast("Location must be verified before submitting attendance.", "danger");
    return;
  }

  const payload = {
    studentId: state.student.id,
    studentName: state.student.name,
    action,
    site: state.student.selectedSite.name,
    lat: state.student.currentPos.lat,
    lng: state.student.currentPos.lng,
    clientTimestamp: new Date().toISOString(),
    userAgent: navigator.userAgent
  };

  const cooldownReady = state.student.dashboard?.today?.nextEligibleCheckoutAt;
  if (action === "Check Out" && cooldownReady) {
    const remainingMs = new Date(cooldownReady).getTime() - Date.now();
    if (remainingMs > 0) {
      renderClockMessage(`Checkout becomes available in ${formatCountdownMinutes(cooldownReady)}.`, "warning");
    }
  }

  try {
    renderClockMessage(`Submitting ${action}...`, "info");
    const response = await submitAttendance(payload);
    rememberLocalAction(action, state.student.selectedSite.name);
    renderClockMessage(`${action} accepted. +${response.pointsDelta} points.`, "success");
    showToast(`${action} accepted for ${state.student.name}.`, "success");
    await loadStudentDashboard(state.student.range);
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
  renderLocalHistory();
}

function renderLocalHistory() {
  if (!state.localHistory.length) {
    dom.localHistoryList.innerHTML = "<div class=\"empty-copy\">No local submissions yet.</div>";
    return;
  }

  dom.localHistoryList.innerHTML = state.localHistory.map((item) => `
    <div class="summary-card">
      <div class="stat-label">${escapeHtml(item.action)}</div>
      <div><strong>${escapeHtml(item.studentName || item.studentId)}</strong></div>
      <div class="metric-copy">${escapeHtml(item.site || "-")}</div>
      <div class="metric-copy">${escapeHtml(formatDateTime(item.timestamp))}</div>
    </div>
  `).join("");
}

function setStudentRange(range) {
  if (state.student.range === range) {
    return;
  }
  state.student.range = range;
  if (!state.student.id || !state.student.name) {
    renderProgressView();
    return;
  }
  loadStudentDashboard(range);
}

function armStudentSessionTimeout() {
  clearTimeout(state.student.sessionTimer);
  state.student.sessionTimer = setTimeout(() => {
    clearStudentSession("Student session cleared after 90 seconds of inactivity.");
  }, state.student.timeoutMs);
}

function clearStudentSession(message, options = {}) {
  clearTimeout(state.student.sessionTimer);
  const preserveInput = Boolean(options.preserveInput);
  const preserveLocation = Boolean(options.preserveLocation);
  if (!preserveInput) {
    dom.studentIdInput.value = "";
  }
  state.student.id = preserveInput ? dom.studentIdInput.value.trim() : "";
  state.student.name = preserveInput && STUDENT_DB[state.student.id] ? STUDENT_DB[state.student.id] : "";
  state.student.dashboard = null;
  if (!preserveLocation) {
    state.student.selectedSite = null;
    state.student.nearbySites = [];
  }
  renderStudentIdentity();
  renderClockView();
  renderProgressView();
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
    closeDetailDrawer();
  }
}

async function loadAdminDashboard() {
  if (!state.admin.token) {
    renderAdminState();
    return;
  }

  try {
    const response = await fetchAdminDashboard({
      token: state.admin.token,
      range: state.admin.range,
      site: state.admin.site
    });
    state.admin.dashboard = response.data;
    populateAdminSiteSelect(response.data.sites || []);
    renderAdminState();
    renderAdminDashboard();
    if (state.admin.selectedStudent) {
      openStudentDetail(state.admin.selectedStudent.studentId);
    }
  } catch (error) {
    if (error.code === "AUTH_REQUIRED") {
      clearAdminSession();
      showToast("Admin session expired. Sign in again.", "danger");
      return;
    }
    showToast(error.message || "Unable to load admin dashboard.", "danger");
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
  renderAdminCharts(state.admin.dashboard);
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
}

function renderHeatmap(container, legend, series, valueKey) {
  if (!container || !legend) return;
  if (!series.length) {
    legend.innerHTML = "<span>No activity in the selected period.</span>";
    container.innerHTML = "<div class=\"empty-copy\">No heatmap data yet.</div>";
    return;
  }

  legend.innerHTML = `<span>Lower</span><span class="legend-chip">Intensity based on ${escapeHtml(valueKey)}</span><span>Higher</span>`;
  container.innerHTML = series.slice(-24).map((row) => {
    const intensity = Math.max(0, Math.min(100, Number(row.intensity) || 0));
    const alpha = intensity === 0 ? 0.08 : 0.18 + intensity / 160;
    const background = valueKey === "activeStudents"
      ? `rgba(216, 179, 93, ${alpha})`
      : `rgba(225, 77, 97, ${alpha})`;
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
