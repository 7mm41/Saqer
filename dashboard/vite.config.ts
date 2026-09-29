import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** The demo is one self-contained HTML file: no install manifest or service worker. */
const standaloneDemo = (): Plugin => ({
  name: 'sarena-standalone-demo',
  transformIndexHtml: (html) => html
    .replace(/\s*<link rel="manifest"[^>]*>/, '')
    .replace(/\s*<link rel="(icon|apple-touch-icon)"[^>]*>/g, '')
    .replace(/<title>[^<]*<\/title>/, '<title>لوحة تحكم سرينا</title>'),
});

// Served by the API at the panel's secret address, which it gives the page with
// <base href> (see backend/src/app.ts), so every path here is relative. In development,
// `npm run dev` proxies the API running on :3000.
// `npm run build:demo` → demo/sarena-admin-demo.html: the whole dashboard with
// an in-browser pretend API (src/demo/server.ts), openable with no server.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: './',
    plugins: demo ? [react(), viteSingleFile(), standaloneDemo()] : [react()],
    server: {
      port: 5173,
      fs: { allow: ['..'] }, // the demo reuses backend/src/db/seed-venues.json
      proxy: {
        '/v1': { target: 'http://localhost:3000', changeOrigin: true },
        '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      },
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      sourcemap: false,
      assetsInlineLimit: demo ? 100_000_000 : 4096,
    },
  };
});
