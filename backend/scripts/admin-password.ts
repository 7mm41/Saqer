// `npm run admin-password` sets the password of the control panel's owner
// (ADMIN_EMAIL, saqer@sarena.tech by default), creating the account if needed.
// The password is typed hidden, twice, and is never printed or saved in clear.
//   --stdin   read it from the first line of the input instead (the installer uses this)
//   --check   only say whether the owner account exists (exit code 0 = yes, 3 = no)
// Stop the server first when it uses the built-in database: only one program
// can open it at a time.
import { loadConfig } from '../src/config.ts';
import { openDatabase } from '../src/db/client.ts';
import { ownerExists, setOwnerPassword } from '../src/db/seed.ts';
import { newPassword } from '../src/lib/validation.ts';

const config = loadConfig();
const args = new Set(process.argv.slice(2));

/** Reads a line from the terminal without showing what is typed. */
function askHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  return new Promise((resolve) => {
    let value = '';
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') { // Ctrl + C
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
        }
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function readStdinLine(): Promise<string> {
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
    if (text.includes('\n')) break;
  }
  return text.split(/\r?\n/)[0] ?? '';
}

async function choosePassword(): Promise<string> {
  if (args.has('--stdin')) return readStdinLine();
  if (!process.stdin.isTTY) {
    console.error('Run this in a terminal (the password is typed hidden), or pass it on the first input line with --stdin.');
    process.exit(1);
  }
  console.log(`New password for ${config.adminEmail} (8+ characters with letters and numbers; nothing shows while you type).`);
  const first = await askHidden('Password: ');
  const second = await askHidden('Again:    ');
  if (first !== second) {
    console.error('The two passwords are different. Nothing changed.');
    process.exit(1);
  }
  return first;
}

if (!config.databaseUrl) {
  const running = await fetch(`http://127.0.0.1:${config.port}/health`, { signal: AbortSignal.timeout(1500) })
    .then((response) => response.ok, () => false);
  if (running) {
    console.error('The server is running. Stop it first (Ctrl + C in its window), then run this command again.');
    process.exit(1);
  }
}

const password = args.has('--check') ? '' : await choosePassword();
if (!args.has('--check') && !newPassword.safeParse(password).success) {
  console.error('The password needs 8 or more characters, with letters and numbers. Nothing changed.');
  process.exit(1);
}

const database = await openDatabase({ databaseUrl: config.databaseUrl, dataDir: config.dataDir });
try {
  if (args.has('--check')) {
    process.exitCode = (await ownerExists(database.db, config)) ? 0 : 3;
  } else {
    const owner = await setOwnerPassword(database.db, config, password);
    console.log(`\nDone: ${owner.email} ${owner.created ? 'was created' : 'has its new password'} (signed out everywhere).`);
    console.log(`Control panel: ${config.publicUrl || `http://localhost:${config.port}`}/${config.panelPath}/`);
    if (config.adminPassword) {
      console.log('Note: ADMIN_PASSWORD in backend/.env replaces this password on the next start. Delete that line.');
    }
    console.log('');
  }
} finally {
  await database.close();
}
