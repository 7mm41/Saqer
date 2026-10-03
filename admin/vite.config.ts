import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The admin panel is served by the API under the secret ADMIN_PATH (§9.1). The build is path-agnostic
// (relative asset URLs + a <base> the API fills in), so rotating the path never needs a rebuild.
const adminPath = process.env.ADMIN_PATH ?? 'dev-admin-path-1234567890ab';

const devBase = (): Plugin => ({
  name: 'katf-admin-base',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace('%ADMIN_BASE%', `/${adminPath}/`),
});

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? `/${adminPath}/` : './',
  plugins: [react(), devBase()],
  build: { outDir: 'dist', sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 900 },
  server: {
    port: 5174,
    proxy: { [`/${adminPath}/api`]: { target: process.env.API_INTERNAL_URL ?? 'http://localhost:4000' }, '/api/files': { target: process.env.API_INTERNAL_URL ?? 'http://localhost:4000' } },
  },
}));
