export type Dict = { [k: string]: string | Dict };
export type Vars = Record<string, string | number>;

function lookup(dict: Dict, key: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur === 'string') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Build a translator: primary dictionary first, then the fallback, then the key itself. */
export function makeT(primary: Dict, fallback?: Dict) {
  return (key: string, vars?: Vars): string => {
    const s = lookup(primary, key) ?? (fallback ? lookup(fallback, key) : undefined);
    return interpolate(s ?? key, vars);
  };
}

export type T = ReturnType<typeof makeT>;

/** Every key in `a` must exist in `b` (used by tests to keep ar/en in sync). */
export function missingKeys(a: Dict, b: Dict, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const other = b[k];
    if (typeof v === 'string') {
      if (typeof other !== 'string') out.push(path);
    } else if (typeof other !== 'object' || other == null) out.push(path);
    else out.push(...missingKeys(v, other, path));
  }
  return out;
}

export { commonAr } from './common.ar';
export { commonEn } from './common.en';
