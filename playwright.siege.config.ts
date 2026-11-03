import { defineConfig } from '@playwright/test';
const port = Number(process.env.HEGEMONY_SIEGE_PORT ?? 5183);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('HEGEMONY_SIEGE_PORT must be a port between 1 and 65535.');
}
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e-siege',
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: '.artifacts/siege/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: '.artifacts/siege/playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    channel: undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
