// Vite (dev server, build) and Vitest. In development /api goes to the backend
// on port 8000, or to API_PROXY_TARGET (`make dev` runs Vite next to the
// Compose stack's backend); in the image nginx proxies it instead (nginx.conf).
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // three.js and react-three-fiber make one ~900 kB chunk (240 kB gzip)
    // that cannot be split further; it is loaded only with the workspace
    // and the sign-in backdrop. Warn about anything else that grows past it.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // The page tests drive whole pages through several steps; on a busy
    // machine or CI runner one can take longer than the 5 s default.
    testTimeout: 15_000,
  },
});
