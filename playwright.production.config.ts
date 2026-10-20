import { defineConfig } from '@playwright/test';
const port = Number(process.env.HEGEMONY_PRODUCTION_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('HEGEMONY_PRODUCTION_PORT must be a port between 1 and 65535.');
const baseURL = `http://127.0.0.1:${port}/hegemony/`;

export default defineConfig({
  testDir: './tests/production',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: 'test-results/production',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/production', open: 'never' }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort --base /hegemony/`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
