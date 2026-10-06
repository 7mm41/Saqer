import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Web build is served by Caddy under /tech/; the iPhone build (CAP_BUILD=1) loads files from the app bundle.
const native = !!process.env.CAP_BUILD;
const fixture = fileURLToPath(new URL('../../packages/demo/fixtures/tech.json', import.meta.url));

// The offline demo (D72) recording is served next to the app in development and in the demo test build.
// The iPhone build gets it from `pnpm ios:sync`; the public PWA never contains it.
const demoFixture = (): Plugin => {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    if (req.url?.split('?')[0] !== '/tech/demo/tech.json') return next();
    res.setHeader('content-type', 'application/json');
    createReadStream(fixture).pipe(res);
  };
  return { name: 'katf-demo-fixture', configureServer: (s) => void s.middlewares.use(serve), configurePreviewServer: (s) => void s.middlewares.use(serve) };
};

export default defineConfig(({ command, isPreview }) => {
  const offlineDemo = native || (command === 'serve' && !isPreview) || process.env.KATF_OFFLINE_DEMO === '1';
  return {
    base: native ? './' : '/tech/',
    define: { __KATF_OFFLINE_DEMO__: JSON.stringify(offlineDemo) },
    plugins: [react(), ...(offlineDemo && !native ? [demoFixture()] : [])],
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
  };
});
