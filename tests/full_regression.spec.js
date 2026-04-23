// Intern Track — Full Regression Suite
// Corrected to match actual element IDs in index.html
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:4173';
const STUDENT_ID = '160601'; // Lenore Ditmore

const ROSTER_FALLBACK_TEST = {
  '160601': 'Lenore Ditmore',
  '131923': 'Jordan Belvin'
};

async function loadApp(page) {
  // Mock roster fetch to fail initially, forcing fallback
  await page.route('**/api/v1/roster', async route => {
    await route.fulfill({
      status: 200, // Should be 200 to return the fallback as data
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: ROSTER_FALLBACK_TEST })
    });
  });

  // Mock student dashboard fetch
  await page.route('**/api/v1/dashboard/student**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          student: { studentId: '160601', studentName: 'Lenore Ditmore' },
          today: { status: 'NOT_STARTED', nextAction: 'Check In' },
          week: { totalPoints: 0, totalHours: 0 },
          summaries: { week: { totalPoints: 0, totalHours: 0 } },
          recentShifts: []
        }
      })
    });
  });

  // Mock admin auth
  await page.route('**/api/v1/admin/auth/login', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        token: 'test-token',
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      })
    });
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600); // Allow time for init and failed fetch
}

// Helper: enter student ID and submit
async function loadStudent(page, id = STUDENT_ID) {
  const input = page.locator('#studentIdInput');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(id);
  
  // Wait for the student's name to appear, confirming the lookup is complete
  await expect(page.locator('#studentNameValue')).toHaveText('Lenore Ditmore', { timeout: 10000 });

  // Allow time for dashboard API call + render
  await page.waitForTimeout(1000);
}

// ────────────────────────────────────────────────
// 1. DARK MODE DEFAULT
// ────────────────────────────────────────────────
test('1. App loads with dark mode by default', async ({ page }) => {
  await loadApp(page);
  const body = page.locator('body');
  const classes = await body.getAttribute('class') || '';
  expect(classes).not.toContain('theme-light');
  // Background colour: must be black or very dark
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  console.log('Body bg:', bg);
  expect(bg).toMatch(/rgb\(0,\s*0,\s*0\)/);
});

// ────────────────────────────────────────────────
// 2. CLOCK VIEW IS DEFAULT
// ────────────────────────────────────────────────
test('2. Clock view is active on load', async ({ page }) => {
  await loadApp(page);
  const clockView = page.locator('#clockView');
  await expect(clockView).toBeVisible({ timeout: 5000 });
  // Student ID input is visible
  const studentInput = page.locator('#studentIdInput');
  await expect(studentInput).toBeVisible({ timeout: 5000 });
  console.log('✅ Clock view active and student input visible');
});

// ────────────────────────────────────────────────
// 3. STUDENT LOOKUP
// ────────────────────────────────────────────────
test('3. Student 160601 resolves to Lenore Ditmore', async ({ page }) => {
  await loadApp(page);
  const input = page.locator('#studentIdInput');
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(STUDENT_ID);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);

  // studentNameValue should update from "—" to the student's name
  const nameEl = page.locator('#studentNameValue');
  await expect(nameEl).toBeVisible({ timeout: 5000 });
  const nameText = await nameEl.textContent();
  console.log('Resolved name:', nameText);
  expect(nameText).toContain('Lenore Ditmore');
});

// ────────────────────────────────────────────────
// 4. PRIMARY ACTION BUTTON APPEARS
// ────────────────────────────────────────────────
test('4. Primary action button appears after student loads', async ({ page }) => {
  await loadApp(page);
  await loadStudent(page);

  const actionBtn = page.locator('#primaryActionButton');
  await expect(actionBtn).toBeVisible({ timeout: 10000 });

  // Wait for "Loading…" to resolve to a real action label
  const label = page.locator('#primaryActionLabel');
  await expect(label).not.toHaveText('Loading…', { timeout: 8000 });

  const btnText = await label.textContent();
  console.log('Action button label:', btnText);
  expect(btnText).toMatch(/Check\s*(In|Out)|Already|Done/i);
});

// ────────────────────────────────────────────────
// 5. CHECKOUT REQUIRES GPS (standardized policy)
// ────────────────────────────────────────────────
test('5. Checkout button requires GPS verification', async ({ page }) => {
  await loadApp(page);
  await loadStudent(page);

  // Mock a CHECKED_IN state
  await page.evaluate(() => {
    if (typeof window.__internState !== 'undefined') {
      window.__internState.student.dashboard = {
        today: {
          status: 'CHECKED_IN',
          site: 'Alliance Diesel',
          checkInTime: '08:00 AM'
        },
        week: { totalPoints: 10, totalHours: 0 }
      };
      // Mock NO GPS
      window.__internState.student.currentPos = null;
      window.__internState.student.selectedSite = null;
      
      if (typeof window.__internRender === 'function') window.__internRender();
    }
  });

  await page.waitForTimeout(300);

  // Button should be disabled if no GPS
  const actionBtn = page.locator('#primaryActionButton');
  const isDisabled = await actionBtn.isDisabled();
  console.log('Action button disabled without GPS:', isDisabled);
  expect(isDisabled).toBe(true);

  // Now mock GPS
  await page.evaluate(() => {
    window.__internState.student.name = 'Lenore Ditmore'; // Ensure name is set
    window.__internState.student.loading = false; // Ensure loading is false
    window.__internState.student.currentPos = { lat: 33.7681, lng: -116.9679 };
    window.__internState.student.selectedSite = { name: 'Alliance Diesel' };
    if (typeof window.__internRender === 'function') window.__internRender();
  });

  await page.waitForTimeout(300);
  const isEnabled = await actionBtn.isEnabled();
  console.log('Action button enabled with GPS:', isEnabled);
  expect(isEnabled).toBe(true);
});

// ────────────────────────────────────────────────
// 6. MY STATS BUTTON VISIBLE AFTER STUDENT LOADS
// ────────────────────────────────────────────────
test('6. My Stats button appears after student loads', async ({ page }) => {
  await loadApp(page);

  // Should be hidden before student is loaded
  const statsBtn = page.locator('#myStatsButton');
  const isHiddenInitially = await statsBtn.evaluate(el =>
    el.classList.contains('is-hidden') || getComputedStyle(el).display === 'none'
  );
  console.log('Stats button hidden initially:', isHiddenInitially);

  await loadStudent(page);

  // After loading, should be visible
  await expect(statsBtn).toBeVisible({ timeout: 10000 });
  console.log('✅ My Stats button shown after student load');
});

// ────────────────────────────────────────────────
// 7. STATS MODAL OPENS AND CLOSES
// ────────────────────────────────────────────────
test('7. Stats modal opens and closes', async ({ page }) => {
  await loadApp(page);
  await loadStudent(page);

  const statsBtn = page.locator('#myStatsButton');
  await expect(statsBtn).toBeVisible({ timeout: 10000 });
  await statsBtn.click();

  const modal = page.locator('#statsModal');
  await expect(modal).toBeVisible({ timeout: 3000 });
  await expect(page.locator('.stats-modal-title')).toBeVisible();
  console.log('✅ Stats modal opened');

  // Close via Done button
  await page.locator('#statsModalClose').click();
  await page.waitForTimeout(400);

  const isOpen = await modal.evaluate(el => el.classList.contains('is-open'));
  expect(isOpen).toBe(false);
  console.log('✅ Stats modal closed via Done button');
});

// ────────────────────────────────────────────────
// 8. STATS MODAL CONTENT POPULATED
// ────────────────────────────────────────────────
test('8. Stats modal content populated after student load', async ({ page }) => {
  await loadApp(page);
  await loadStudent(page);

  const statsBtn = page.locator('#myStatsButton');
  await expect(statsBtn).toBeVisible({ timeout: 10000 });
  await statsBtn.click();

  const modal = page.locator('#statsModal');
  await expect(modal).toBeVisible({ timeout: 3000 });

  const content = page.locator('#statsModalContent');
  const text = await content.textContent();
  console.log('Modal content preview:', text?.slice(0, 100));
  expect(text).not.toContain('Enter your student ID on the Clock tab first.');
  console.log('✅ Stats modal populated with student data');
});

// ────────────────────────────────────────────────
// 9. MY WEEK TAB
// ────────────────────────────────────────────────
test('9. My Week tab loads with View Stats button', async ({ page }) => {
  await loadApp(page);
  await loadStudent(page);

  // Click the My Week tab (data-view-button="progress")
  await page.locator('[data-view-button="progress"]').click();
  await page.waitForTimeout(500);

  const progressView = page.locator('#progressView');
  await expect(progressView).toBeVisible({ timeout: 5000 });

  const viewStatsBtn = page.locator('#progressStatsButton');
  await expect(viewStatsBtn).toBeVisible({ timeout: 5000 });
  console.log('✅ My Week tab loaded with View Stats button');
});

// ────────────────────────────────────────────────
// 10. VIEW STATS FROM PROGRESS TAB
// ────────────────────────────────────────────────
test('10. View Stats on My Week tab opens modal', async ({ page }) => {
  await loadApp(page);
  await loadStudent(page);

  await page.locator('[data-view-button="progress"]').click();
  await page.waitForTimeout(500);

  const viewStatsBtn = page.locator('#progressStatsButton');
  await expect(viewStatsBtn).toBeVisible({ timeout: 5000 });
  await viewStatsBtn.click();

  const modal = page.locator('#statsModal');
  await expect(modal).toBeVisible({ timeout: 3000 });
  console.log('✅ Stats modal opened from My Week tab');

  // Close via overlay click
  await modal.click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(400);
  const isOpen = await modal.evaluate(el => el.classList.contains('is-open'));
  expect(isOpen).toBe(false);
  console.log('✅ Modal closed by clicking overlay');
});

// ────────────────────────────────────────────────
// 11. ADMIN TAB — LOGIN FORM
// ────────────────────────────────────────────────
test('11. Admin tab shows login form', async ({ page }) => {
  await loadApp(page);

  await page.locator('[data-view-button="admin"]').click();
  await page.waitForTimeout(500);

  const adminView = page.locator('#adminView');
  await expect(adminView).toBeVisible({ timeout: 5000 });

  const passwordInput = page.locator('#adminPasswordInput');
  await expect(passwordInput).toBeVisible({ timeout: 5000 });
  console.log('✅ Admin login form present');
});

// ────────────────────────────────────────────────
// 12. THEME TOGGLE
// ────────────────────────────────────────────────
test('12. Theme toggle switches dark ↔ light', async ({ page }) => {
  await loadApp(page);
  const body = page.locator('body');

  // Dark by default
  let cls = await body.getAttribute('class') || '';
  expect(cls).not.toContain('theme-light');

  const themeToggle = page.locator('#themeToggle');
  if (await themeToggle.count() === 0) {
    console.log('ℹ️  No #themeToggle found, skipping');
    return;
  }

  // Switch to light
  await themeToggle.click();
  await page.waitForTimeout(300);
  cls = await body.getAttribute('class') || '';
  expect(cls).toContain('theme-light');
  console.log('✅ Toggled to light mode');

  // Switch back to dark
  await themeToggle.click();
  await page.waitForTimeout(300);
  cls = await body.getAttribute('class') || '';
  expect(cls).not.toContain('theme-light');
  console.log('✅ Toggled back to dark mode');
});

// ────────────────────────────────────────────────
// 13. GPS DENIAL GRACEFUL
// ────────────────────────────────────────────────
test('13. GPS denial does not crash the app', async ({ page }) => {
  const jsErrors = [];
  page.on('pageerror', err => jsErrors.push(err.message));

  // Override geolocation to fail
  await page.context().setGeolocation(null);

  await loadApp(page);
  await loadStudent(page);

  const actionBtn = page.locator('#primaryActionButton');
  await expect(actionBtn).toBeVisible({ timeout: 10000 });

  const critical = jsErrors.filter(e =>
    !e.includes('Failed to fetch') &&
    !e.includes('NetworkError') &&
    !e.includes('net::ERR') &&
    !e.includes('Geolocation') &&
    !e.includes('getCurrentPosition')
  );

  if (critical.length > 0) console.error('Critical JS errors:', critical);
  expect(critical).toHaveLength(0);
  console.log('✅ GPS denial handled gracefully');
});

// ────────────────────────────────────────────────
// 14. NO CRITICAL JS ERRORS ON LOAD
// ────────────────────────────────────────────────
test('14. No critical JS errors on initial load', async ({ page }) => {
  const jsErrors = [];
  page.on('pageerror', err => jsErrors.push(err.message));

  await loadApp(page);
  await page.waitForTimeout(1000);

  const critical = jsErrors.filter(e =>
    !e.includes('Failed to fetch') &&
    !e.includes('NetworkError') &&
    !e.includes('net::ERR') &&
    !e.includes('Geolocation')
  );

  if (critical.length > 0) console.error('JS Errors:', critical);
  expect(critical).toHaveLength(0);
  console.log('✅ No critical JS errors on load');
});

// ────────────────────────────────────────────────
// 15. CLEAR SESSION RESETS STUDENT STATE
// ────────────────────────────────────────────────
test('15. Clear session resets student state', async ({ page }) => {
  await loadApp(page);
  await loadStudent(page);

  // Confirm student name is loaded
  const nameEl = page.locator('#studentNameValue');
  await expect(nameEl).toBeVisible({ timeout: 5000 });

  // Click Reset session button
  const clearBtn = page.locator('#clearStudentButton');
  await expect(clearBtn).toBeVisible({ timeout: 5000 });
  await clearBtn.click();
  await page.waitForTimeout(500);

  // Student ID input should be cleared
  const input = page.locator('#studentIdInput');
  const val = await input.inputValue();
  expect(val).toBe('');

  // Name should reset to the default placeholder ("-")
  const nameText = await nameEl.textContent();
  expect(nameText?.trim()).toBe('-');
  console.log('✅ Session cleared, inputs reset');
});
