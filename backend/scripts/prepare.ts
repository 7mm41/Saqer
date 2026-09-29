// Runs before `npm start` and `npm run dev`. It installs missing packages and builds
// the control panel when it is missing or older than its source files. After a
// fresh download or a `git pull`, `npm start` is then enough on its own: without
// a build, /admin/ has nothing to serve.
// It only warns on failure, so the server still starts (the website and the app
// keep working).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { join, resolve } from 'node:path';

const backend = resolve(import.meta.dirname, '..');
const dashboard = resolve(backend, '../dashboard');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function say(message: string) {
  console.log(`\x1b[33m▸ ${message}\x1b[0m`);
}

function run(cwd: string, args: string[]): boolean {
  return spawnSync(npm, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' }).status === 0;
}

const modified = (path: string) => (existsSync(path) ? statSync(path).mtimeMs : 0);

/** The latest change to any file under `path`, skipping build output and packages. */
function newest(path: string): number {
  if (!existsSync(path)) return 0;
  const info = statSync(path);
  if (!info.isDirectory()) return info.mtimeMs;
  let latest = 0;
  for (const entry of readdirSync(path)) {
    if (['node_modules', 'dist', 'dist-demo', 'demo', '.DS_Store'].includes(entry)) continue;
    latest = Math.max(latest, newest(join(path, entry)));
  }
  return latest;
}

/** Installs a project's packages if it has none or its package list changed since. */
function install(dir: string, name: string): boolean {
  // npm writes this file on every install; it marks when packages were last installed.
  const marker = join(dir, 'node_modules', '.package-lock.json');
  const installed = modified(marker);
  if (installed && installed >= Math.max(modified(join(dir, 'package.json')), modified(join(dir, 'package-lock.json')))) {
    return true;
  }
  say(`Installing the ${name} packages (first start or new packages)…`);
  if (!run(dir, ['install', '--no-audit', '--no-fund'])) {
    say(`Couldn't install the ${name} packages. Check the internet connection, then run: cd ${dir} && npm install`);
    return false;
  }
  if (existsSync(marker)) {
    const now = new Date();
    utimesSync(marker, now, now);
  }
  return true;
}

install(backend, 'server');

if (process.env.DASHBOARD_DIR || !existsSync(join(dashboard, 'package.json'))) {
  // A custom control panel location (e.g. the Docker image, which builds it itself).
  process.exit(0);
}

const built = join(dashboard, 'dist', 'index.html');
// The panel also shows sample venues from the server's seed file.
const source = Math.max(newest(dashboard), modified(join(backend, 'src', 'db', 'seed-venues.json')));
if (existsSync(built) && modified(built) >= source) process.exit(0);

if (install(dashboard, 'control panel')) {
  say(existsSync(built) ? 'Updating the control panel (/admin/)…' : 'Building the control panel (/admin/)…');
  if (!run(dashboard, ['run', 'build'])) {
    say(existsSync(built)
      ? 'The control panel build failed: the previous version stays at /admin/.'
      : `The control panel build failed, so /admin/ is unavailable. Details above; to retry: cd ${dashboard} && npm run build`);
  }
}
