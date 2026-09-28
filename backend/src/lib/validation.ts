import { z } from 'zod';
import { ApiError } from './errors.ts';

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
