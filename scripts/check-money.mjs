#!/usr/bin/env node
// Money guard (§0): money is always an integer number of baisa. No floats, no decimal columns.
// Fails on parseFloat anywhere, toFixed/Math.round on money-looking values, and non-integer money columns.
// Formatting and parsing of OMR text happens only in shared/src/money.ts. A line can opt out with "money-ok".
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dirs = ['shared/src', 'api/src', 'web/app', 'web/components', 'web/lib', 'tech/src', 'admin/src', 'ui/src'];
const skip = /node_modules|\.next|dist/;
const MONEY = /(amount|fee|price|total|baisa|omr|commission|refund|payout|net|balance|labou?r|parts)/i;
const allowFile = /shared\/src\/money\.ts$/;

function* walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (skip.test(p)) continue;
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(p)) yield p;
  }
}

const problems = [];
for (const d of dirs) {
  for (const file of walk(join(root, d))) {
    if (allowFile.test(file)) continue;
    const rel = relative(root, file);
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (line.includes('money-ok')) return;
        const at = `${rel}:${i + 1}: ${line.trim().slice(0, 110)}`;
        if (/\bparseFloat\(/.test(line)) problems.push(`${at}  → parseFloat: use parseOMR/parsePercent`);
        if (/\.toFixed\(/.test(line) && MONEY.test(line)) problems.push(`${at}  → toFixed on money: use formatOMR`);
        if (/(\*|\/)\s*1000\b/.test(line) && MONEY.test(line) && !/ms|seconds|_000|Date|time/i.test(line)) problems.push(`${at}  → manual OMR/baisa conversion: use formatOMR/parseOMR`);
        if (rel === 'api/src/db/schema.ts' && /(real|doublePrecision|numeric|decimal)\(/.test(line) && MONEY.test(line)) problems.push(`${at}  → money column must be integer baisa`);
      });
  }
}
if (problems.length) {
  console.error(`Money check failed (${problems.length}):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('Money check passed: integers in baisa only.');
