import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /**
     * The browser talks to the Vite origin and Vite forwards /api to the Express
     * process. Two benefits: no CORS preflight in development, and the client code
     * uses the same relative `/api/v1/...` paths it would use in production behind
     * a single reverse proxy — so there is no environment-specific base URL to get
     * wrong.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
