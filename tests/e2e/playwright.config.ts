/**
 * End-to-end tests (§15): real browsers against the real API, website, technician PWA and admin panel.
 * Each run starts its own servers on separate ports with a fresh database, the mock payment provider,
 * the mock SMS provider and labelled demo data. Nothing here can reach a real payment or SMS network.
 */
import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// shared by the main process and the workers through the environment
process.env.E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'katf-e2e-'));
process.env.E2E_OWNER_PW ??= randomBytes(12).toString('hex');
process.env.E2E_ADMIN_PATH ??= 'e2e-admin-path-0123456789abcdef';

export const PORTS = { api: 4100, web: 3100, tech: 5175 };
const API = `http://localhost:${PORTS.api}`;
const WEB = `http://localhost:${PORTS.web}`;
const TECH = `http://localhost:${PORTS.tech}`;

const apiEnv = {
  NODE_ENV: 'development',
  PORT: String(PORTS.api),
  DATA_DIR: process.env.E2E_DATA_DIR,
  DEMO_MODE: 'true',
  ENABLE_DEV_ENDPOINTS: 'true',
  SMS_PROVIDER: 'mock',
  PAYMENT_PROVIDER: 'mock',
  ADMIN_PATH: process.env.E2E_ADMIN_PATH,
  PUBLIC_ORIGIN: WEB,
  TECH_ORIGIN: TECH,
  ADMIN_ORIGIN: API,
  API_PUBLIC_URL: API,
  RATE_LIMIT_SCALE: '100',
  SCHEDULER_INTERVAL_MS: '2000',
  LOG_LEVEL: 'warn',
  OWNER_EMAIL: 'owner@example.invalid',
  OWNER_NAME: 'مالك الاختبار',
  E2E_OWNER_PW: process.env.E2E_OWNER_PW,
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROME ? { executablePath: process.env.CHROME } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      cwd: '../../apps/api',
      // build the admin panel, seed demo data, create the owner (password piped, random per run), start
      command: `sh -c "(cd ../admin && npx vite build >/dev/null) && npx tsx src/cli.ts demo-seed && printf '%s\\n%s\\n' \\"$E2E_OWNER_PW\\" \\"$E2E_OWNER_PW\\" | npx tsx src/cli.ts create-owner >/dev/null && npx tsx src/main.ts"`,
      url: `${API}/api/health`,
      env: apiEnv as Record<string, string>,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'web',
      cwd: '../../apps/web',
      command: `npx next dev -p ${PORTS.web}`,
      url: `${WEB}/robots.txt`,
      env: { API_INTERNAL_URL: API, PUBLIC_ORIGIN: WEB, NEXT_TELEMETRY_DISABLED: '1' },
      timeout: 240_000,
      reuseExistingServer: false,
    },
    {
      name: 'tech',
      cwd: '../../apps/tech',
      command: `sh -c "npx vite build >/dev/null && npx vite preview --port ${PORTS.tech} --strictPort"`,
      url: `${TECH}/tech/`,
      env: { API_INTERNAL_URL: API },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});

export const URLS = { API, WEB, TECH, ADMIN: `${API}/${process.env.E2E_ADMIN_PATH}/` };
