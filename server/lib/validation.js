import { z } from 'zod';
import { validDate } from '../../shared/date.js';
export { validDate } from '../../shared/date.js';

const email = z.string().trim().toLowerCase().email().max(254);
export const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    email,
    password: z.string().min(12, 'Use at least 12 characters.').max(128),
  })
  .strict();
export const loginSchema = z
  .object({ email, password: z.string().min(1).max(128) })
  .strict();
export const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    project: z.string().trim().min(1).max(60),
    description: z.string().trim().max(1000).default(''),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    status: z.enum(['todo', 'progress', 'done']).default('todo'),
    due: z.string().refine(validDate, 'Enter a valid date.').default(''),
  })
  .strict();
// PATCH fields must not apply creation defaults to omitted values.
export const taskUpdateSchema = z
  .object({
    title: taskSchema.shape.title.optional(),
    project: taskSchema.shape.project.optional(),
    description: taskSchema.shape.description.removeDefault().optional(),
    priority: taskSchema.shape.priority.removeDefault().optional(),
    status: taskSchema.shape.status.removeDefault().optional(),
    due: taskSchema.shape.due.removeDefault().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No changes supplied.');
export const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(30),
    search: z.string().trim().max(120).default(''),
    project: z.string().trim().max(60).default(''),
  })
  .strict();
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const error = new Error('Please check your input.');
    error.status = 400;
    error.details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw error;
  }
  return result.data;
}
