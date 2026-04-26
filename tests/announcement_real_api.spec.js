const path = require("path");
const fs = require("fs");
const { test, expect } = require("@playwright/test");

const OUTPUT_DIR = path.join(process.cwd(), "output", "playwright");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

test("real get_announcement returns active data and modal shows", async ({ page }) => {
  let apiResponse = null;

  // Capture the real (unintercepted) API response
  page.on("response", async (res) => {
    if (res.url().includes("mode=get_announcement")) {
      try { apiResponse = await res.json(); } catch {}
    }
  });

  // Clear seen state so modal can show
  await page.addInitScript(() => {
    localStorage.removeItem("intern-track-announcement-seen");
  });

  await page.goto("/");

  // Wait past the splash (3s) + fetch time
  await page.waitForTimeout(6000);

  console.log("Real API response:", JSON.stringify(apiResponse, null, 2));

  // API must return ok and have an active announcement
  expect(apiResponse).not.toBeNull();
  expect(apiResponse.ok).toBe(true);
  expect(apiResponse.data).not.toBeNull();
  expect(apiResponse.data.active).toBe(true);
  expect(apiResponse.data.title).toBeTruthy();

  // Modal must be visible
  const modal = page.locator("#migrationNoticeModal.is-open");
  await expect(modal).toBeVisible({ timeout: 2000 });

  await page.screenshot({
    path: path.join(OUTPUT_DIR, "real-api-modal-visible.png"),
    fullPage: false
  });

  console.log("✅ Real API returned active announcement and modal is visible");
});
