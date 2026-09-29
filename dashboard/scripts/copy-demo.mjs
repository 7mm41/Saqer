// Copies the single-file demo build to demo/sarena-admin-demo.html (kept in git
// so it can be downloaded and opened directly, with no server).
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('demo', { recursive: true });
copyFileSync('dist-demo/index.html', 'demo/sarena-admin-demo.html');
console.log('demo/sarena-admin-demo.html');
