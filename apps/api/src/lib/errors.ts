export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export const badRequest = (code: string, details?: Record<string, unknown>) => new AppError(400, code, details);
export const unauthorized = (code = 'unauthorized') => new AppError(401, code);
export const forbidden = (code = 'forbidden') => new AppError(403, code);
export const notFound = (code = 'not_found') => new AppError(404, code);
export const conflict = (code = 'conflict', details?: Record<string, unknown>) => new AppError(409, code, details);
export const tooMany = (code = 'rate_limited', details?: Record<string, unknown>) => new AppError(429, code, details);
