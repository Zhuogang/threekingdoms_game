import { defineConfig } from 'vitest/config';

/** Timing tests run alone: parallel unit tests would distort them. */
export default defineConfig({
  test: { include: ['tests/perf/**/*.perf.ts'], environment: 'node', fileParallelism: false },
});
