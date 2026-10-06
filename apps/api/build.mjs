// Bundles the API (and the operator CLI) into dist/ for production.
// npm packages stay external (installed in the image); workspace packages (@katf/*) are bundled.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@katf/'));

await build({
  entryPoints: { main: 'src/main.ts', cli: 'src/cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [...external, ...external.map((d) => `${d}/*`)],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
