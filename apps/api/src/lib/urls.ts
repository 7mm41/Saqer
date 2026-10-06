import type { Ctx } from '../ctx';
/** True when `url` points at one of our own origins (exact scheme + host + port; "katf.om.evil.com" is not "katf.om"). */
export function isOwnUrl(ctx: Ctx, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const origin = (x: URL) => `${x.protocol}//${x.host}`.toLowerCase();
  const allowed = [ctx.config.PUBLIC_ORIGIN, ctx.config.TECH_ORIGIN, ...ctx.config.corsOrigins].flatMap((o) => {
    try {
      return [origin(new URL(o))];
    } catch {
      return [];
    }
  });
  return allowed.includes(origin(u));
}
