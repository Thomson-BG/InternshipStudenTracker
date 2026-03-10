const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 10000 },
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 14
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    geolocation: { latitude: 34.052235, longitude: -118.243683 }, // LA area
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
