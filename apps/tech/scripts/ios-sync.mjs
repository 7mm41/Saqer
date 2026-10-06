// Refreshes everything the Xcode project (ios/Katf.xcodeproj) takes from this package, so the project
// opens and builds on a Mac straight after cloning, without Node or `pnpm install`:
//
//   ios/Katf/public/                the technician app built for the iPhone (relative paths)
//   ios/Katf/capacitor.config.json  Capacitor settings + the list of native plugin classes
//   ios/Katf/config.xml             Capacitor's (empty) Cordova config
//   ios/Katf/public/demo/           offline demo recording for the technician app (D72)
//   ios/Katf/public/admin-demo/     read-only admin panel on its own recording (D72)
//   ios/Plugins/<Name>/             native sources of each Capacitor plugin, copied from node_modules
//   ios/CapApp-SPM/Package.swift    the Swift package that links those plugins into the app
//
// Usage: pnpm --filter @katf/tech ios:sync   (then commit the changes under ios/)
// CI runs it and fails if ios/ differs from what is committed.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tech = join(dirname(fileURLToPath(import.meta.url)), '..');
const ios = join(tech, '..', '..', 'ios');
const app = join(ios, 'Katf');
const pluginsDir = join(ios, 'Plugins');
const stage = join(tech, '.cap-ios'); // ios.path in capacitor.config.ts
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { cwd: tech, stdio: 'inherit', env: { ...process.env, ...env } });
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---------------------------------------------------------------- 1. web bundle for the app
run('pnpm', ['exec', 'vite', 'build', '--logLevel', 'warn'], { CAP_BUILD: '1' });

// ---------------------------------------------------------------- 2. Capacitor's own copy step, into a scratch folder
// The CLI only writes into its default layout (<ios.path>/App/App); CapApp-SPM marks the project as SPM.
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'App', 'App'), { recursive: true });
mkdirSync(join(stage, 'App', 'CapApp-SPM'), { recursive: true });
run('pnpm', ['exec', 'cap', 'copy', 'ios']);
const out = join(stage, 'App', 'App');
for (const f of ['public', 'capacitor.config.json', 'config.xml']) {
  if (!existsSync(join(out, f))) throw new Error(`cap copy did not write ${f}`);
}
rmSync(join(app, 'public'), { recursive: true, force: true });
cpSync(join(out, 'public'), join(app, 'public'), { recursive: true });
const capJson = readJson(join(out, 'capacitor.config.json'));
delete capJson.ios?.path; // only meaningful to the CLI on this machine
writeFileSync(join(app, 'capacitor.config.json'), `${JSON.stringify(capJson, null, '\t')}\n`);
cpSync(join(out, 'config.xml'), join(app, 'config.xml'));
rmSync(stage, { recursive: true, force: true });

// ---------------------------------------------------------------- 2b. offline demo (D72)
// Labelled demo data recorded from the real API (pnpm demo:record). The Xcode build removes both folders
// unless the build setting KATF_OFFLINE_DEMO is YES (Debug by default), so Release builds never carry them.
const fixtures = join(tech, '..', '..', 'packages', 'demo', 'fixtures');
mkdirSync(join(app, 'public', 'demo'), { recursive: true });
cpSync(join(fixtures, 'tech.json'), join(app, 'public', 'demo', 'tech.json'));
const adminBuild = mkdtempSync(join(tmpdir(), 'katf-admin-demo-'));
execFileSync('pnpm', ['exec', 'vite', 'build', '--logLevel', 'warn'], {
  cwd: join(tech, '..', 'admin'),
  stdio: 'inherit',
  env: { ...process.env, KATF_OFFLINE_DEMO: '1', KATF_ADMIN_OUT: adminBuild },
});
const adminDemo = join(app, 'public', 'admin-demo');
cpSync(adminBuild, adminDemo, { recursive: true });
rmSync(adminBuild, { recursive: true, force: true });
const adminHtml = join(adminDemo, 'index.html');
writeFileSync(adminHtml, readFileSync(adminHtml, 'utf8').replace('%ADMIN_BASE%', '/admin-demo/')); // the API fills this in for the real panel
cpSync(join(fixtures, 'admin.json'), join(adminDemo, 'demo.json'));

// ---------------------------------------------------------------- 3. native plugin sources
const deps = Object.keys(readJson(join(tech, 'package.json')).dependencies ?? {});
const plugins = [];
for (const id of deps) {
  const dir = realpathSync(join(tech, 'node_modules', id));
  const pkg = readJson(join(dir, 'package.json'));
  const iosSrc = pkg.capacitor?.ios?.src;
  if (!iosSrc) continue; // not a native plugin (@capacitor/core, @capacitor/ios, web-only packages)
  const manifest = join(dir, 'Package.swift');
  if (!existsSync(manifest)) throw new Error(`${id} has no Package.swift (Swift Package Manager support is required)`);
  const swift = readFileSync(manifest, 'utf8');
  const name = /Package\(\s*name:\s*"([^"]+)"/.exec(swift)?.[1];
  if (!name) throw new Error(`cannot read the package name in ${id}/Package.swift`);
  plugins.push({ id, version: pkg.version, license: pkg.license ?? 'see LICENSE', dir, iosSrc, name, swift });
}
plugins.sort((a, b) => a.name.localeCompare(b.name));

rmSync(pluginsDir, { recursive: true, force: true });
for (const p of plugins) {
  const dest = join(pluginsDir, p.name);
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'Package.swift'), p.swift);
  cpSync(join(p.dir, p.iosSrc), join(dest, p.iosSrc), { recursive: true });
  for (const f of readdirSync(p.dir)) if (/^(LICEN[CS]E|NOTICE)/i.test(f)) cpSync(join(p.dir, f), join(dest, f));
  // every path the manifest points at must have come along
  for (const [, rel] of p.swift.matchAll(/path:\s*"([^"]+)"/g)) {
    if (!existsSync(join(dest, rel))) throw new Error(`${p.id}: Package.swift uses "${rel}", which is outside ${p.iosSrc}/`);
  }
}
writeFileSync(
  join(pluginsDir, 'README.md'),
  [
    '# Native plugins (generated)',
    '',
    'Copied from `node_modules` by `apps/tech/scripts/ios-sync.mjs` so the Xcode project builds without Node.',
    'Do not edit: change the version in `apps/tech/package.json` and run `pnpm --filter @katf/tech ios:sync`.',
    '',
    '| Swift package | npm package | Version | Licence |',
    '|---|---|---|---|',
    ...plugins.map((p) => `| ${p.name} | ${p.id} | ${p.version} | ${p.license} |`),
    '',
  ].join('\n'),
);

// ---------------------------------------------------------------- 4. the Swift package the app links
const capVersion = readJson(join(realpathSync(join(tech, 'node_modules', '@capacitor', 'ios')), 'package.json')).version;
const list = (items) => items.join(',\n');
writeFileSync(
  join(ios, 'CapApp-SPM', 'Package.swift'),
  `// swift-tools-version: 5.9
import PackageDescription

// Generated by apps/tech/scripts/ios-sync.mjs — do not edit by hand.
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
${list([`        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "${capVersion}")`, ...plugins.map((p) => `        .package(name: "${p.name}", path: "../Plugins/${p.name}")`)])}
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
${list([`                .product(name: "Capacitor", package: "capacitor-swift-pm")`, `                .product(name: "Cordova", package: "capacitor-swift-pm")`, ...plugins.map((p) => `                .product(name: "${p.name}", package: "${p.name}")`)])}
            ]
        )
    ]
)
`,
);

console.log(`ios/ updated: web bundle, ${plugins.length} plugins (${plugins.map((p) => p.name).join(', ')}), Capacitor ${capVersion}`);
