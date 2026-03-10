const { defineConfig } = require('@playwright/test');

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173';

module.exports = defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: { timeout: 20000 },
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 14
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    geolocation: { latitude: 33.7681647078012, longitude: -116.96797385328925 },
    permissions: ['geolocation'],
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        }
      }
    }
  ]
});
