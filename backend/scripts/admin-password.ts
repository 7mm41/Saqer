// `npm run admin-password` sets a new password for the control panel admin and
// prints the sign-in details. Pass your own password with
// `npm run admin-password -- MyPassword2026`.
// Stop the server first when it uses the built-in database: only one program
// can open it at a time.
import { loadConfig } from '../src/config.ts';
import { openDatabase } from '../src/db/client.ts';
import { resetAdminPassword } from '../src/db/seed.ts';
import { newPassword } from '../src/lib/validation.ts';

const config = loadConfig();
const chosen = process.argv[2];

if (chosen !== undefined && !newPassword.safeParse(chosen).success) {
  console.error('The password needs 8 or more characters, with letters and numbers.');
  process.exit(1);
}

if (!config.databaseUrl) {
  const running = await fetch(`http://127.0.0.1:${config.port}/health`, { signal: AbortSignal.timeout(1500) })
    .then((response) => response.ok, () => false);
  if (running) {
    console.error('The server is running. Stop it first (Ctrl + C in its window), then run this command again.');
    process.exit(1);
  }
}

const database = await openDatabase({ databaseUrl: config.databaseUrl, dataDir: config.dataDir });
try {
  const admin = await resetAdminPassword(database.db, config, chosen);
  const line = '─'.repeat(52);
  console.log(`\n${line}`);
  console.log(`  Control panel sign-in${admin.created ? ' (new admin account)' : ''}`);
  console.log(`  Email:     ${admin.email}`);
  console.log(`  Password:  ${admin.password}`);
  console.log(line);
  console.log('  Start the server again, then sign in at /admin/.');
  if (!config.adminPasswordGenerated && chosen !== undefined && chosen !== config.adminPassword) {
    console.log('  Note: ADMIN_PASSWORD in backend/.env replaces this password on the next start.');
    console.log('  Put the same password there, or delete that line.');
  } else if (!config.adminPasswordGenerated) {
    console.log('  (This is ADMIN_PASSWORD from backend/.env.)');
  }
  console.log('');
} finally {
  await database.close();
}
