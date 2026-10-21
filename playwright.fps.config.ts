import { defineConfig } from '@playwright/test';

/**
 * Frame-rate checks on deliberately slowed machines (review R8). Opt-in (`npm run test:fps`),
 * one worker, outside `npm run test:e2e`, so timing noise never fails the ordinary suite.
 * Each project's `metadata` says how the browser is slowed; baseline and CPU 4x enforce the target.
 * FPS_DEVICE_SCALE=2 repeats the same fixture at HiDPI for renderer-resolution comparisons.
 */
export default defineConfig({
  testDir: './tests/fps',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  outputDir: 'test-results/fps',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: Number(process.env.FPS_DEVICE_SCALE || 1),
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'baseline', metadata: { cpuThrottle: 1, enforce: true } },
    { name: 'cpu-4x', metadata: { cpuThrottle: 4, enforce: true } },
    { name: 'cpu-6x', metadata: { cpuThrottle: 6, enforce: false } },
    {
      name: 'swiftshader',
      metadata: { cpuThrottle: 1, enforce: false },
      use: { launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] } },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
