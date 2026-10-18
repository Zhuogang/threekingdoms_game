import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/production',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: 'test-results/production',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/production', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/hegemony/',
    viewport: { width: 1440, height: 1000 },
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort --base /hegemony/',
    url: 'http://127.0.0.1:4173/hegemony/',
    reuseExistingServer: false,
  },
});
