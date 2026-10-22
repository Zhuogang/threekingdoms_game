import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    watch: {
      ignored: [
        '**/baye-fmj-app-main/**',
        '**/.artifacts/**',
        '**/playwright-report/**',
        '**/test-results/**',
      ],
    },
  },
  test: { include: ['tests/v03/**/*.test.ts'], environment: 'node' },
  build: { chunkSizeWarningLimit: 700 },
});
