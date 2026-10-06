import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Web build is served by Caddy under /tech/; the iPhone build (CAP_BUILD=1) loads files from the app bundle.
const native = !!process.env.CAP_BUILD;

export default defineConfig({
  base: native ? './' : '/tech/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_INTERNAL_URL ?? 'http://localhost:4000', changeOrigin: false } },
  },
  preview: { port: 5173 },
});
