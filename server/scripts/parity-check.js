#!/usr/bin/env node

const { adminLogin, fetchStudentDashboard, fetchAdminDashboard, fetchReportData } = require("../lib/service");

const DEFAULT_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw3GBhNTbtaOlSVBL6r9SJqXX1CuTgSNP0DOnp8jxH0zvTofzyZkmK_OWruVqq9Fbs/exec";

const appsScriptUrl = String(process.env.APPS_SCRIPT_URL || DEFAULT_APPS_SCRIPT_URL).trim();
const adminPassword = String(process.env.ADMIN_PASSWORD || "").trim();
const studentIds = String(process.env.PARITY_STUDENT_IDS || "160601,131923")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const ranges = ["week", "month", "overall"];
const sites = ["all", ...(process.env.PARITY_SITE ? [String(process.env.PARITY_SITE)] : [])];

if (!adminPassword) {
  console.error("Missing ADMIN_PASSWORD env var for parity auth.");
  process.exit(1);
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pick(obj, path, fallback = undefined) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || !Object.prototype.hasOwnProperty.call(current, part)) {
      return fallback;
    }
    current = current[part];
  }
  return current;
}

function compareNumber(diffs, label, left, right, tolerance = 0.05) {
  const a = toNumber(left);
  const b = toNumber(right);
  if (Math.abs(a - b) > tolerance) {
    diffs.push(`${label}: apps_script=${a} neondb=${b}`);
  }
}

function compareString(diffs, label, left, right) {
  const a = String(left ?? "").trim();
  const b = String(right ?? "").trim();
  if (a !== b) {
    diffs.push(`${label}: apps_script=${JSON.stringify(a)} neondb=${JSON.stringify(b)}`);
  }
}

async function requestAppsScript(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (_error) {
    throw new Error(`Apps Script returned non-JSON response (${response.status}): ${text.slice(0, 180)}`);
  }
  if (!response.ok || payload.ok === false) {
    throw new Error(`Apps Script request failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function loginAppsScript() {
  const payload = await requestAppsScript(`${appsScriptUrl}?mode=admin_auth`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({ password: adminPassword })
  });
  return payload.token;
}

async function getAppsStudentDashboard(studentId, range) {
  const url = `${appsScriptUrl}?mode=student_dashboard&studentId=${encodeURIComponent(studentId)}&range=${encodeURIComponent(range)}`;
  const payload = await requestAppsScript(url);
  return payload.data;
}

async function getAppsAdminDashboard(token, range, site) {
  const url = `${appsScriptUrl}?mode=admin_dashboard&token=${encodeURIComponent(token)}&range=${encodeURIComponent(range)}&site=${encodeURIComponent(site)}`;
  const payload = await requestAppsScript(url);
  return payload.data;
}

async function getAppsReportData(token, type, range, site, studentId = "") {
  const query = new URLSearchParams({
    mode: "report_data",
    token,
    type,
    range,
    site
  });
  if (studentId) {
    query.set("studentId", studentId);
  }

  const payload = await requestAppsScript(`${appsScriptUrl}?${query.toString()}`);
  return payload.data;
}

function compareStudentDashboard(studentId, range, apps, neo, diffs) {
  compareString(diffs, `[student:${studentId}:${range}] student.name`, pick(apps, "student.studentName"), pick(neo, "student.studentName"));
  compareString(diffs, `[student:${studentId}:${range}] today.status`, pick(apps, "today.status"), pick(neo, "today.status"));
  compareString(diffs, `[student:${studentId}:${range}] today.nextAction`, pick(apps, "today.nextAction"), pick(neo, "today.nextAction"));

  compareNumber(diffs, `[student:${studentId}:${range}] week.totalPoints`, pick(apps, "week.totalPoints", pick(apps, "week.points")), pick(neo, "week.totalPoints", pick(neo, "week.points")));
  compareNumber(diffs, `[student:${studentId}:${range}] week.hoursDecimal`, pick(apps, "week.hoursDecimal", pick(apps, "week.hours")), pick(neo, "week.hoursDecimal", pick(neo, "week.hours")));

  compareNumber(diffs, `[student:${studentId}:${range}] selected.points`, pick(apps, "selected.points"), pick(neo, "selected.points"));
  compareNumber(diffs, `[student:${studentId}:${range}] selected.hours`, pick(apps, "selected.hours"), pick(neo, "selected.hours"));
  compareNumber(diffs, `[student:${studentId}:${range}] selected.pointsPctOfTop`, pick(apps, "selected.pointsPctOfTop"), pick(neo, "selected.pointsPctOfTop"), 0.2);
  compareNumber(diffs, `[student:${studentId}:${range}] selected.hoursPctOfTop`, pick(apps, "selected.hoursPctOfTop"), pick(neo, "selected.hoursPctOfTop"), 0.2);

  compareNumber(diffs, `[student:${studentId}:${range}] recentShifts.length`, (apps.recentShifts || []).length, (neo.recentShifts || []).length, 0);
}

function compareAdminDashboard(range, site, apps, neo, diffs) {
  compareNumber(diffs, `[admin:${range}:${site}] selected.activeStudents`, pick(apps, "selected.activeStudents"), pick(neo, "selected.activeStudents"), 0);
  compareNumber(diffs, `[admin:${range}:${site}] selected.pointsTotal`, pick(apps, "selected.pointsTotal"), pick(neo, "selected.pointsTotal"));
  compareNumber(diffs, `[admin:${range}:${site}] selected.hoursTotal`, pick(apps, "selected.hoursTotal"), pick(neo, "selected.hoursTotal"));
  compareNumber(diffs, `[admin:${range}:${site}] selected.completedShifts`, pick(apps, "selected.completedShifts"), pick(neo, "selected.completedShifts"), 0);
  compareNumber(diffs, `[admin:${range}:${site}] selected.openShifts`, pick(apps, "selected.openShifts"), pick(neo, "selected.openShifts"), 0);
  compareNumber(diffs, `[admin:${range}:${site}] selected.exceptionCount`, pick(apps, "selected.exceptionCount"), pick(neo, "selected.exceptionCount"), 0);

  const appsLeaderboard = apps.leaderboard || [];
  const neoLeaderboard = neo.leaderboard || [];
  const max = Math.min(3, appsLeaderboard.length, neoLeaderboard.length);
  for (let index = 0; index < max; index += 1) {
    compareString(diffs, `[admin:${range}:${site}] leaderboard[${index}].studentName`, appsLeaderboard[index]?.studentName, neoLeaderboard[index]?.studentName);
    compareNumber(diffs, `[admin:${range}:${site}] leaderboard[${index}].points`, appsLeaderboard[index]?.points, neoLeaderboard[index]?.points);
    compareNumber(diffs, `[admin:${range}:${site}] leaderboard[${index}].hours`, appsLeaderboard[index]?.hours, neoLeaderboard[index]?.hours);
  }
}

function compareReport(type, range, site, apps, neo, diffs) {
  compareString(diffs, `[report:${type}:${range}:${site}] reportTitle`, apps.reportTitle, neo.reportTitle);
  compareString(diffs, `[report:${type}:${range}:${site}] type`, apps.type, neo.type);

  if (type === "cohort") {
    compareNumber(diffs, `[report:${type}:${range}:${site}] payload.selected.pointsTotal`, pick(apps, "payload.selected.pointsTotal"), pick(neo, "payload.selected.pointsTotal"));
    compareNumber(diffs, `[report:${type}:${range}:${site}] payload.selected.hoursTotal`, pick(apps, "payload.selected.hoursTotal"), pick(neo, "payload.selected.hoursTotal"));
  }
}

async function run() {
  console.log("Starting parity check...");
  console.log(`Apps Script URL: ${appsScriptUrl}`);

  const appsToken = await loginAppsScript();
  const neoLogin = await adminLogin(adminPassword);
  const neoToken = neoLogin.token;

  const diffs = [];

  for (const studentId of studentIds) {
    for (const range of ranges) {
      const [apps, neoResp] = await Promise.all([
        getAppsStudentDashboard(studentId, range),
        fetchStudentDashboard({ studentId, range })
      ]);
      compareStudentDashboard(studentId, range, apps, neoResp.data, diffs);
    }
  }

  for (const range of ranges) {
    for (const site of sites) {
      const [apps, neoResp] = await Promise.all([
        getAppsAdminDashboard(appsToken, range, site),
        fetchAdminDashboard({ token: neoToken, range, site })
      ]);
      compareAdminDashboard(range, site, apps, neoResp.data, diffs);

      const [appsReport, neoReportResp] = await Promise.all([
        getAppsReportData(appsToken, "cohort", range, site),
        fetchReportData({ token: neoToken, type: "cohort", range, site, studentId: "" })
      ]);
      compareReport("cohort", range, site, appsReport, neoReportResp.data, diffs);
    }
  }

  for (const range of ranges) {
    const studentId = studentIds[0];
    const [appsReport, neoReportResp] = await Promise.all([
      getAppsReportData(appsToken, "student", range, "all", studentId),
      fetchReportData({ token: neoToken, type: "student", range, site: "all", studentId })
    ]);
    compareReport("student", range, "all", appsReport, neoReportResp.data, diffs);
  }

  if (diffs.length) {
    console.error(`Parity check found ${diffs.length} difference(s):`);
    diffs.forEach((diff) => console.error(` - ${diff}`));
    process.exit(1);
  }

  console.log("Parity check passed with no differences in monitored fields.");
}

run().catch((error) => {
  console.error("Parity check failed:", error);
  process.exit(1);
});
