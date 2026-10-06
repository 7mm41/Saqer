import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { commonAr, commonEn } from '@katf/shared/i18n';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('error messages (§15)', () => {
  it('every error code the API can return has Arabic and English text', () => {
    const codes = new Set<string>();
    for (const f of files(join(__dirname, '..', 'src'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(?:badRequest|conflict|forbidden|notFound|tooMany|unauthorized)\('([a-z_]+)'/g)) codes.add(m[1]!);
      for (const m of src.matchAll(/AppError\(\d+, '([a-z_]+)'/g)) codes.add(m[1]!);
    }
    // setting validation codes come from @katf/shared
    const shared = readFileSync(join(__dirname, '..', '..', '..', 'packages', 'shared', 'src', 'settings.ts'), 'utf8');
    const fn = shared.slice(shared.indexOf('export function validateSetting'), shared.indexOf('export function renderSettingValue'));
    for (const m of fn.matchAll(/'([a-z_]+)'/g)) if (!['bool', 'text', 'time', 'enum', 'json', 'boolean', 'string', 'number'].includes(m[1]!)) codes.add(m[1]!);
    const ar = commonAr.errors as Record<string, string>;
    const en = commonEn.errors as Record<string, string>;
    const missing = [...codes].filter((c) => !ar[c] || !en[c]);
    expect(missing).toEqual([]);
    expect(codes.size).toBeGreaterThan(50);
  });
});
