/**
 * Operator commands:
 *   seed                 production seed (catalog, areas, legal drafts, templates)
 *   create-owner         create the owner account (password typed into a hidden prompt, never printed)
 *   verify-audit         recompute the audit hash chain
 *   demo-seed            demo data (only when DEMO_MODE=true)
 *   openapi              print the OpenAPI document
 *   state-machine        print the Mermaid state diagram
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { stateMachineMermaid } from '@katf/shared';
import { createContext } from './context';
import { seedProduction } from './seed';
import { createAdmin } from './services/auth';
import { verifyAudit } from './services/audit';
import { buildApp } from './app';

// One readline for all prompts, so piped answers (one per line) are not lost between questions.
let muted = false;
const out = new Writable({
  write(chunk, enc, cb) {
    if (!muted) process.stdout.write(chunk, enc);
    cb();
  },
});
let rl: ReturnType<typeof createInterface> | null = null;
const lines: string[] = [];
const waiting: ((s: string) => void)[] = [];
function reader() {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: out, terminal: Boolean(process.stdin.isTTY) });
    rl.on('line', (l) => (waiting.length ? waiting.shift()!(l) : lines.push(l)));
    rl.on('close', () => waiting.splice(0).forEach((w) => w('')));
  }
  return rl;
}
function prompt(question: string, hide: boolean): Promise<string> {
  reader();
  process.stdout.write(question);
  muted = hide;
  return new Promise((resolve) => {
    const done = (l: string) => {
      muted = false;
      if (hide) process.stdout.write('\n');
      resolve(l.trim());
    };
    if (lines.length) done(lines.shift()!);
    else waiting.push(done);
  });
}
const closeReader = () => rl?.close();
const hidden = (q: string) => prompt(q, true);
const ask = (q: string) => prompt(q, false);

const cmd = process.argv[2];
if (cmd === 'state-machine') {
  console.log(stateMachineMermaid());
  process.exit(0);
}
const ctx = await createContext();
try {
  if (cmd === 'seed') {
    await seedProduction(ctx);
    console.log('seeded');
  } else if (cmd === 'create-owner') {
    const email = process.env.OWNER_EMAIL || (await ask('Owner email: '));
    const name = process.env.OWNER_NAME || (await ask('Owner display name: '));
    const pw = await hidden('Password (12+ characters, hidden): ');
    const pw2 = await hidden('Repeat password: ');
    if (pw !== pw2) throw new Error('passwords do not match');
    await seedProduction(ctx);
    await createAdmin(ctx, { email, password: pw, role: 'owner', displayName: name });
    console.log('Owner created. Sign in at the admin path and set up the authenticator app (TOTP) on first sign-in.');
  } else if (cmd === 'verify-audit') {
    const r = await verifyAudit(ctx.db);
    console.log(r.ok ? `audit chain OK (${r.checked} rows)` : `audit chain BROKEN at row ${r.brokenAt}`);
    process.exitCode = r.ok ? 0 : 2;
  } else if (cmd === 'demo-seed') {
    if (!ctx.config.DEMO_MODE) throw new Error('demo-seed requires DEMO_MODE=true');
    const { seedDemo } = await import('./demo');
    await seedProduction(ctx);
    await seedDemo(ctx);
    console.log('demo data created (labelled as demo on every screen)');
  } else if (cmd === 'openapi') {
    const app = await buildApp(ctx);
    await app.ready();
    console.log(JSON.stringify(app.swagger(), null, 2));
  } else {
    console.log('commands: seed | create-owner | verify-audit | demo-seed | openapi | state-machine');
  }
} catch (e) {
  console.error(String((e as Error).message));
  process.exitCode = 1;
} finally {
  closeReader();
  await ctx.handle.close();
}
