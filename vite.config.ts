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
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  build: {
    // Pixi (about 555 kB, loaded on demand with the map) and the app chunk (about 530 kB, mostly
    // React, zod and icons) sit just over the default 500 kB, so the limit is raised to 600.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/pixi.js') || id.includes('node_modules/@pixi'))
            return 'pixi';
          if (/src\/i18n\/.*\.zh\.ts$/.test(id.replaceAll('\\', '/'))) return 'zh-catalog';
          return undefined;
        },
      },
    },
  },
});
