import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The admin panel is served by the API under the secret ADMIN_PATH (§9.1). The build is path-agnostic
// (relative asset URLs + a <base> the API fills in), so rotating the path never needs a rebuild.
const adminPath = process.env.ADMIN_PATH ?? 'dev-admin'; // same default as the API in development

// Offline demo (D72): KATF_OFFLINE_DEMO=1 builds a read-only panel that answers from a recording
// (packages/demo). Only the iPhone app's Debug builds carry it; the real panel is built without it.
const offlineDemo = process.env.KATF_OFFLINE_DEMO === '1';
const fixture = fileURLToPath(new URL('../../packages/demo/fixtures/admin.json', import.meta.url));

const devBase = (): Plugin => ({
  name: 'katf-admin-base',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace('%ADMIN_BASE%', `/${adminPath}/`),
});

const demoFixture = (): Plugin => {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] !== `/${adminPath}/demo.json`) return next();
    res.setHeader('content-type', 'application/json');
    createReadStream(fixture).pipe(res);
  };
  return { name: 'katf-demo-fixture', apply: 'serve', configureServer: (s) => void s.middlewares.use(serve) };
};

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? `/${adminPath}/` : './',
  define: { __KATF_OFFLINE_DEMO__: JSON.stringify(offlineDemo) },
  plugins: [react(), devBase(), ...(offlineDemo ? [demoFixture()] : [])],
  build: { outDir: process.env.KATF_ADMIN_OUT ?? 'dist', emptyOutDir: true, sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 900 },
  server: {
    port: 5174,
    proxy: { [`/${adminPath}/api`]: { target: process.env.API_INTERNAL_URL ?? 'http://localhost:4000' }, '/api/files': { target: process.env.API_INTERNAL_URL ?? 'http://localhost:4000' } },
  },
}));
