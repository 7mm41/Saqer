import { z } from 'zod';
import { isOmaniMobile, normalizePhone } from './codes.ts';
import { ApiError } from './errors.ts';

/** An Omani mobile number, stored as its 8 digits. */
export const phoneSchema = z.string().transform(normalizePhone).refine(isOmaniMobile, 'Omani mobile numbers have 8 digits and start with 7 or 9.');
/** A new password: at least 8 characters with letters and numbers. */
export const newPassword = z.string().min(8).max(200).refine((v) => /[a-zA-Z\p{L}]/u.test(v) && /\d/.test(v), 'Use letters and numbers.');

/** Parses input with a zod schema, turning failures into a 400 `validation_failed`. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new ApiError(400, 'validation_failed', `${where}${issue?.message ?? 'Invalid input.'}`);
  }
  return result.data;
}

export const localized = z.object({ en: z.string().trim().min(1).max(4000), ar: z.string().trim().min(1).max(4000) });
export const localizedList = z.array(localized).max(20);
export const uuidParam = z.object({ id: z.uuid() });
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
