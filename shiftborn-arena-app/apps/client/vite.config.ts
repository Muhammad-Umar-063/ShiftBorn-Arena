import { defineConfig } from 'vite';

// Vite requires the default export for its configuration entry point.
export default defineConfig({
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: {
      '/ws': { target: 'http://localhost:2567', ws: true },
      '/healthz': { target: 'http://localhost:2567' },
    },
  },
});
