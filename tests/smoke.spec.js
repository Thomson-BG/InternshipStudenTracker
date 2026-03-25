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

test("startup, student dashboard, admin dashboard smoke", async ({ page, baseURL }) => {
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

  await page.locator("#studentIdInput").fill(STUDENT_ID);
  await expect(page.locator("#studentNameValue")).toHaveText("Lenore Ditmore");
  await expect(page.locator("#studentNameCopy")).not.toContainText("loading latest progress", { timeout: 20000 });
  await expect(page.locator("#clockMessage")).toHaveText("Student progress loaded.", { timeout: 20000 });
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
    (response) => response.url().includes("mode=admin_auth"),
    { timeout: 20000 }
  );
  const adminDashboardRequest = page.waitForResponse(
    (response) => response.url().includes("mode=admin_dashboard"),
    { timeout: 30000 }
  );

  await page.locator("#adminPasswordInput").fill(ADMIN_PASSWORD);
  await page.locator("#adminLoginButton").click();
  await adminAuthRequest;
  await adminDashboardRequest;
  await expect(page.locator("#adminContent")).not.toHaveClass(/is-hidden/, { timeout: 30000 });
  await expect(page.locator("#adminLoginState")).toHaveClass(/is-hidden/, { timeout: 30000 });
  await expect(page.locator("#adminKpiGrid")).not.toBeEmpty({ timeout: 30000 });
  tracker.assertNone();
  await capture(page, "admin-dashboard");
});
