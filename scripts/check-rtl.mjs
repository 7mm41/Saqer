#!/usr/bin/env node
// RTL guard (§14): layout must use logical properties so Arabic (RTL) and English (LTR) both work.
// Fails on physical left/right in CSS and inline styles. A line can opt out with "rtl-ok" in a comment.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dirs = ['ui/src', 'web/app', 'web/components', 'tech/src', 'admin/src'];
const skip = /node_modules|\.next|dist/;
const CSS = [
  [/\b(margin|padding|border)-(left|right)\b/, 'use margin-inline-start/end, padding-inline-*, border-inline-*'],
  [/(^|[\s;{])(left|right)\s*:/, 'use inset-inline-start/end'],
  [/text-align\s*:\s*(left|right)\b/, 'use text-align: start/end'],
  [/\bfloat\s*:\s*(left|right)\b/, 'use float: inline-start/end'],
  [/border-(top|bottom)-(left|right)-radius/, 'use border-start-start-radius etc.'],
];
const TSX = [
  [/\b(margin|padding|border)(Left|Right)\s*:/, 'use marginInlineStart/End etc.'],
  [/\btextAlign\s*:\s*['"](left|right)['"]/, "use textAlign: 'start'/'end'"],
  [/[{,]\s*(left|right)\s*:\s*[-\d'"]/, 'use insetInlineStart/End'],
];

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (skip.test(p)) continue;
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const problems = [];
for (const d of dirs) {
  for (const file of walk(join(root, d))) {
    const rules = file.endsWith('.css') ? CSS : /\.(tsx|ts)$/.test(file) ? TSX : null;
    if (!rules) continue;
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.includes('rtl-ok')) return;
        for (const [re, hint] of rules) if (re.test(line)) problems.push(`${relative(root, file)}:${i + 1}: ${line.trim().slice(0, 100)}  → ${hint}`);
      });
  }
}
if (problems.length) {
  console.error(`RTL check failed (${problems.length}):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('RTL check passed: no physical left/right in styles.');
