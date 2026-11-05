import { defineConfig } from '@playwright/test';

const port = Number(process.env.HEGEMONY_PROBE_PORT ?? 5191);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('HEGEMONY_PROBE_PORT must be a port between 1 and 65535.');
}

const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/probe-v05',
  fullyParallel: false,
  timeout: 30 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  outputDir: 'test-results/probe-v05',
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    video: 'off',
    trace: 'off',
    launchOptions: process.env.HEGEMONY_PROBE_CHROMIUM
      ? { executablePath: process.env.HEGEMONY_PROBE_CHROMIUM }
      : {},
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
