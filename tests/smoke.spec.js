const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const STUDENT_ID = "160601";
const ADMIN_PASSWORD = (() => {
  if (!process.env.PLAYWRIGHT_ADMIN_PASSWORD) {
    throw new Error(
      'PLAYWRIGHT_ADMIN_PASSWORD environment variable is required to run tests. ' +
      'Set it before running: export PLAYWRIGHT_ADMIN_PASSWORD="your_password"'
    );
  }
  return process.env.PLAYWRIGHT_ADMIN_PASSWORD;
})();
const SMOKE_LABEL = (process.env.PLAYWRIGHT_SMOKE_LABEL || "smoke")
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, "-");
const OUTPUT_DIR = path.join(process.cwd(), "output", "playwright");

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function createClientFailureTracker(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const requestUrls = [];

  page.on("request", (request) => {
    requestUrls.push(request.url());
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("requestfailed", (request) => {
    requestFailures.push({
      url: request.url(),
      error: request.failure()?.errorText || "unknown"
    });
  });

  return {
    assertNone() {
      expect(consoleErrors, `Unexpected console errors: ${JSON.stringify(consoleErrors)}`).toEqual([]);
      expect(pageErrors, `Unexpected page errors: ${JSON.stringify(pageErrors)}`).toEqual([]);
      expect(requestFailures, `Unexpected request failures: ${JSON.stringify(requestFailures)}`).toEqual([]);
    },
    getRequests() {
      return requestUrls.slice();
    }
  };
}

async function capture(page, suffix) {
  ensureOutputDir();
  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${SMOKE_LABEL}-${suffix}.png`),
    fullPage: true
  });
}

async function installApiMocks(page) {
  await page.route("**/api/v1/roster", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          "160601": "Lenore Ditmore",
          "131923": "Jordan Belvin"
        }
      })
    });
  });

  await page.route("**/api/v1/dashboard/student**", async (route) => {
    await page.waitForTimeout(250);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          student: { studentId: "160601", studentName: "Lenore Ditmore", name: "Lenore Ditmore" },
          currentRange: "week",
          week: { totalPoints: 10, hoursDecimal: 2.5 },
          today: { status: "NOT_STARTED", nextAction: "Check In", localDate: "2026-03-20" },
          summaries: {
            week: { points: 10, hours: 2.5, pointsPctOfTop: 50, hoursPctOfTop: 45, percentile: 65, topPoints: 20, topHours: 5 },
            month: { points: 22, hours: 5.5, pointsPctOfTop: 55, hoursPctOfTop: 50, percentile: 66, topPoints: 40, topHours: 11 },
            overall: { points: 30, hours: 7.5, pointsPctOfTop: 60, hoursPctOfTop: 55, percentile: 70, topPoints: 50, topHours: 13 }
          },
          selected: { points: 10, hours: 2.5, pointsPctOfTop: 50, hoursPctOfTop: 45, percentile: 65, topPoints: 20, topHours: 5, gapToTopPoints: 10, gapToTopHours: 2.5 },
          charts: {
            weeklyPoints: [
              { label: "3/17", value: 0 },
              { label: "3/18", value: 5 },
              { label: "3/19", value: 5 },
              { label: "3/20", value: 0 }
            ],
            weeklyHours: [
              { label: "3/17", value: 0 },
              { label: "3/18", value: 1.2 },
              { label: "3/19", value: 1.3 },
              { label: "3/20", value: 0 }
            ],
            cumulative: [
              { label: "3/17", points: 0, hours: 0 },
              { label: "3/18", points: 5, hours: 1.2 },
              { label: "3/19", points: 10, hours: 2.5 },
              { label: "3/20", points: 10, hours: 2.5 }
            ],
            heatmap: []
          },
          recentShifts: [
            { localDate: "2026-03-19", site: "Alliance Diesel", status: "COMPLETE", hoursDecimal: 1.3, totalPoints: 5 },
            { localDate: "2026-03-18", site: "Alliance Diesel", status: "COMPLETE", hoursDecimal: 1.2, totalPoints: 5 }
          ],
          exceptions: [],
          benchmark: { topPoints: 20, topHours: 5, benchmarkLabel: "Top student in week" }
        },
        meta: { source: "neondb" }
      })
    });
  });

  await page.route("**/api/v1/admin/auth/login", async (route) => {
    await page.waitForTimeout(200);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        token: "test-admin-token",
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
      })
    });
  });

  await page.route("**/api/v1/dashboard/admin**", async (route) => {
    await page.waitForTimeout(250);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          currentRange: "overall",
          currentSite: "all",
          generatedAt: new Date().toISOString(),
          sites: ["all", "Alliance Diesel"],
          summaries: {
            week: { activeStudents: 1, pointsTotal: 10, hoursTotal: 2.5, completedShifts: 2, openShifts: 0, exceptionCount: 0 },
            month: { activeStudents: 1, pointsTotal: 22, hoursTotal: 5.5, completedShifts: 4, openShifts: 0, exceptionCount: 0 },
            overall: { activeStudents: 2, pointsTotal: 42, hoursTotal: 10.3, completedShifts: 7, openShifts: 1, exceptionCount: 0 }
          },
          today: { localDate: "2026-03-20", activeStudents: 1, completedShifts: 0, openShifts: 1, exceptionCount: 0 },
          todayStudents: [
            { studentId: "160601", studentName: "Lenore Ditmore", status: "OPEN", isActive: true, checkInUtc: new Date().toISOString(), checkOutUtc: "", site: "Alliance Diesel", hoursDecimal: 0.8, totalPoints: 5 }
          ],
          selected: { activeStudents: 2, pointsTotal: 42, hoursTotal: 10.3, completedShifts: 7, openShifts: 1, exceptionCount: 0, topStudentName: "Jordan Belvin", topPoints: 32, topHours: 7.8 },
          leaderboard: [
            { studentId: "131923", studentName: "Jordan Belvin", points: 32, hours: 7.8, percentile: 100, rank: 1, pointsPctOfTop: 100, hoursPctOfTop: 100 },
            { studentId: "160601", studentName: "Lenore Ditmore", points: 10, hours: 2.5, percentile: 0, rank: 2, pointsPctOfTop: 31.3, hoursPctOfTop: 32.1 }
          ],
          students: [
            {
              studentId: "160601",
              studentName: "Lenore Ditmore",
              week: { points: 10, hours: 2.5 },
              month: { points: 22, hours: 5.5 },
              overall: { points: 10, hours: 2.5 },
              selectedRange: { points: 10, hours: 2.5, pointsPctOfTop: 31.3, hoursPctOfTop: 32.1, percentile: 0, lastActivityUtc: new Date().toISOString(), shiftStatus: "OPEN" }
            }
          ],
          charts: {
            pointsTrend: [
              { label: "3/17", value: 10 },
              { label: "3/18", value: 12 },
              { label: "3/19", value: 8 },
              { label: "3/20", value: 12 }
            ],
            hoursTrend: [
              { label: "3/17", value: 2.2 },
              { label: "3/18", value: 3.1 },
              { label: "3/19", value: 1.8 },
              { label: "3/20", value: 3.2 }
            ],
            leaderboard: [
              { label: "Jordan Belvin", points: 32, hours: 7.8 },
              { label: "Lenore Ditmore", points: 10, hours: 2.5 }
            ],
            scatter: [
              { label: "Jordan Belvin", x: 7.8, y: 32 },
              { label: "Lenore Ditmore", x: 2.5, y: 10 }
            ],
            siteBreakdown: [
              { site: "Alliance Diesel", points: 42, hours: 10.3 }
            ],
            exceptionBreakdown: [
              { label: "Complete", value: 7 },
              { label: "Open", value: 1 },
              { label: "Exception", value: 0 }
            ],
            heatmap: []
          },
          exceptions: [
            { studentId: "160601", studentName: "Lenore Ditmore", localDate: "2026-03-20", status: "OPEN", site: "Alliance Diesel", message: "Checkout still missing.", lastActivityUtc: new Date().toISOString() }
          ],
          auditTrail: [
            { timestampUtc: new Date().toISOString(), actorType: "ADMIN", action: "LOGIN", outcomeCode: "RECORDED", message: "Admin login succeeded." }
          ],
          recentShifts: [
            { localDate: "2026-03-20", studentId: "160601", studentName: "Lenore Ditmore", site: "Alliance Diesel", status: "OPEN", hoursDecimal: 0.8, totalPoints: 5 }
          ],
          printable: {
            title: "Cohort Summary Report",
            subtitle: "overall / all",
            generatedAt: new Date().toISOString()
          },
          source: "neondb",
          dataQuality: "ok",
          diagnostics: {}
        },
        meta: {
          source: "neondb",
          dataQuality: "ok",
          fallbackUsed: false,
          diagnostics: {}
        }
      })
    });
  });

  await page.route("**/api/v1/reports**", async (route) => {
    await page.waitForTimeout(220);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          type: "cohort",
          generatedAt: new Date().toISOString(),
          reportTitle: "Cohort Summary Report",
          reportSubtitle: "overall / all",
          payload: {
            selected: { pointsTotal: 42, hoursTotal: 10.3, completedShifts: 7, openShifts: 1, exceptionCount: 0, topStudentName: "Jordan Belvin", topPoints: 32, topHours: 7.8, activeStudents: 2 },
            leaderboard: [
              { studentName: "Jordan Belvin", points: 32, hours: 7.8, percentile: 100 },
              { studentName: "Lenore Ditmore", points: 10, hours: 2.5, percentile: 0 }
            ],
            exceptions: [
              { localDate: "2026-03-20", studentName: "Lenore Ditmore", status: "OPEN", site: "Alliance Diesel", message: "Checkout still missing." }
            ],
            charts: {
              siteBreakdown: [
                { site: "Alliance Diesel", points: 42, hours: 10.3 }
              ]
            }
          }
        }
      })
    });
  });
}

test("startup, student dashboard, admin dashboard smoke", async ({ page, baseURL }) => {
  await installApiMocks(page);
  const tracker = createClientFailureTracker(page);

  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#clockView")).toHaveClass(/is-active/);
  await expect(page.locator("#studentIdInput")).toBeVisible();
  await expect(page.locator("#locationMapCanvas")).toHaveClass(/leaflet-container/, { timeout: 15000 });
  await expect(page.locator(".location-grid-dots")).toHaveCount(0);
  await expect(page.locator(".location-ring")).toHaveCount(0);
  await expect(page.locator(".location-core-glow")).toHaveCount(0);
  tracker.assertNone();
  await capture(page, "clock");

  const studentDashboardRequest = page.waitForResponse(
    (response) => response.url().includes("/api/v1/dashboard/student"),
    { timeout: 20000 }
  );
  await page.locator("#studentIdInput").fill(STUDENT_ID);
  await expect(page.locator("#globalLoadingModal")).toHaveClass(/is-open/, { timeout: 10000 });
  await studentDashboardRequest;
  await expect(page.locator("#studentNameValue")).toHaveText("Lenore Ditmore");
  await expect(page.locator("#studentNameCopy")).not.toContainText("loading latest progress", { timeout: 20000 });
  await expect(page.locator("#clockMessage")).toHaveText("Student progress loaded.", { timeout: 20000 });
  await expect(page.locator("#globalLoadingModal")).not.toHaveClass(/is-open/, { timeout: 10000 });
  const googleRequests = tracker.getRequests().filter((url) => url.includes("script.google.com") || url.includes("/gviz/tq"));
  expect(googleRequests, `Unexpected legacy Google backend requests: ${JSON.stringify(googleRequests)}`).toEqual([]);
  tracker.assertNone();
  await capture(page, "student");

  await page.locator('[data-view-button="progress"]').click();
  await expect(page.locator("#progressView")).toHaveClass(/is-active/);
  await expect(page.locator("#progressStudentName")).toContainText("Lenore");
  await expect(page.locator("#sevenDayHistoryList .history-day-row")).toHaveCount(7);
  tracker.assertNone();
  await capture(page, "progress");

  await page.locator('[data-view-button="admin"]').click();
  await expect(page.locator("#adminView")).toHaveClass(/is-active/);
  await expect(page.locator("#adminPasswordInput")).toBeVisible();
  tracker.assertNone();
  await capture(page, "admin-login");

  const adminAuthRequest = page.waitForResponse(
    (response) => response.url().includes("/api/v1/admin/auth/login"),
    { timeout: 20000 }
  );
  const adminDashboardRequest = page.waitForResponse(
    (response) => response.url().includes("/api/v1/dashboard/admin"),
    { timeout: 30000 }
  );

  await page.locator("#adminPasswordInput").fill(ADMIN_PASSWORD);
  await page.locator("#adminLoginButton").click();
  await expect(page.locator("#globalLoadingModal")).toHaveClass(/is-open/, { timeout: 10000 });
  await adminAuthRequest;
  await adminDashboardRequest;
  await expect(page.locator("#adminContent")).not.toHaveClass(/is-hidden/, { timeout: 30000 });
  await expect(page.locator("#adminLoginState")).toHaveClass(/is-hidden/, { timeout: 30000 });
  await expect(page.locator("#adminKpiGrid")).not.toBeEmpty({ timeout: 30000 });
  await expect(page.locator("#globalLoadingModal")).not.toHaveClass(/is-open/, { timeout: 10000 });
  tracker.assertNone();
  await capture(page, "admin-dashboard");

  const reportRequest = page.waitForResponse(
    (response) => response.url().includes("/api/v1/reports"),
    { timeout: 20000 }
  );
  await page.locator("#adminPrintCohortButton").click();
  await expect(page.locator("#globalLoadingModal")).toHaveClass(/is-open/, { timeout: 10000 });
  await reportRequest;
  await expect(page.locator("#reportModal")).toHaveClass(/is-open/, { timeout: 20000 });
  await expect(page.locator("#globalLoadingModal")).not.toHaveClass(/is-open/, { timeout: 10000 });
  tracker.assertNone();
  await capture(page, "report");
});
