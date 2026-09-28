import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served by the API at /admin/ (see backend/src/app.ts). In development,
// `npm run dev` proxies the API running on :3000.
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
