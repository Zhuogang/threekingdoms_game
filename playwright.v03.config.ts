import { defineConfig } from '@playwright/test';

const port = Number(process.env.HEGEMONY_V03_PORT ?? 5181);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('HEGEMONY_V03_PORT must be a port between 1 and 65535.');
}

const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e-v03',
  fullyParallel: false,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: 'test-results/v03',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/v03', open: 'never' }]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
