const path = require("path");
const fs = require("fs");
const { test, expect } = require("@playwright/test");

const OUTPUT_DIR = path.join(process.cwd(), "output", "playwright");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const MOCK_ANNOUNCEMENT = {
  ok: true,
  data: {
    label: "Test Update",
    title: "Playwright Test Announcement",
    body: "<p>This is a test announcement from Playwright.</p>",
    startIso: new Date(Date.now() - 60000).toISOString(), // started 1 min ago
    durationDays: 7,
    active: true
  }
};

test.describe("Announcement Modal", () => {
  test("modal appears after splash when announcement is active", async ({ page }) => {
    // Intercept the get_announcement endpoint and return a mock active announcement
    await page.route("**/api/exec?mode=get_announcement", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ANNOUNCEMENT)
      });
    });

    // Clear localStorage so "seen" state doesn't block
    await page.addInitScript(() => {
      localStorage.removeItem("intern-track-announcement-seen");
    });

    await page.goto("/");

    // Wait for the announcement modal to appear (after splash ~3s + fetch)
    const modal = page.locator("#migrationNoticeModal.is-open");
    await expect(modal).toBeVisible({ timeout: 15000 });

    // Verify content is dynamically populated
    await expect(page.locator("#migrationNoticeLabel")).toHaveText("Test Update");
    await expect(page.locator("#migrationNoticeTitle")).toHaveText("Playwright Test Announcement");
    await expect(page.locator("#migrationNoticeBody")).toContainText("This is a test announcement");

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "announcement-modal-visible.png"),
      fullPage: false
    });

    console.log("✅ Modal appeared with correct dynamic content");
  });

  test("modal does NOT appear when already seen this startIso", async ({ page }) => {
    const seenStartIso = MOCK_ANNOUNCEMENT.data.startIso;

    await page.route("**/api/exec?mode=get_announcement", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ANNOUNCEMENT)
      });
    });

    // Pre-set localStorage as if this announcement was already seen
    await page.addInitScript((startIso) => {
      localStorage.setItem("intern-track-announcement-seen", startIso);
    }, seenStartIso);

    await page.goto("/");

    // Wait past the splash + fetch window
    await page.waitForTimeout(6000);

    const modal = page.locator("#migrationNoticeModal.is-open");
    await expect(modal).not.toBeVisible();

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "announcement-modal-hidden-after-seen.png"),
      fullPage: false
    });

    console.log("✅ Modal correctly hidden after already seen");
  });

  test("modal does NOT appear when no active announcement", async ({ page }) => {
    await page.route("**/api/exec?mode=get_announcement", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: null })
      });
    });

    await page.addInitScript(() => {
      localStorage.removeItem("intern-track-announcement-seen");
    });

    await page.goto("/");
    await page.waitForTimeout(6000);

    const modal = page.locator("#migrationNoticeModal.is-open");
    await expect(modal).not.toBeVisible();

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "announcement-modal-no-data.png"),
      fullPage: false
    });

    console.log("✅ Modal correctly hidden when no active announcement");
  });

  test("re-publish with new startIso shows modal again", async ({ page }) => {
    const oldStartIso = new Date(Date.now() - 86400000).toISOString(); // yesterday
    const newStartIso = new Date(Date.now() - 60000).toISOString(); // 1 min ago

    const freshAnnouncement = {
      ...MOCK_ANNOUNCEMENT,
      data: { ...MOCK_ANNOUNCEMENT.data, startIso: newStartIso, title: "Republished Announcement" }
    };

    await page.route("**/api/exec?mode=get_announcement", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(freshAnnouncement)
      });
    });

    // Mark the OLD announcement as seen — new one should still show
    await page.addInitScript((startIso) => {
      localStorage.setItem("intern-track-announcement-seen", startIso);
    }, oldStartIso);

    await page.goto("/");

    const modal = page.locator("#migrationNoticeModal.is-open");
    await expect(modal).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#migrationNoticeTitle")).toHaveText("Republished Announcement");

    await page.screenshot({
      path: path.join(OUTPUT_DIR, "announcement-modal-republished.png"),
      fullPage: false
    });

    console.log("✅ New announcement shows after re-publish with new startIso");
  });

  test("get_announcement API call is made on page load", async ({ page }) => {
    let announcementFetched = false;

    await page.route("**/api/exec?mode=get_announcement", async (route) => {
      announcementFetched = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: null })
      });
    });

    await page.goto("/");
    await page.waitForTimeout(2000);

    expect(announcementFetched).toBe(true);
    console.log("✅ get_announcement API called on page load");
  });
});
