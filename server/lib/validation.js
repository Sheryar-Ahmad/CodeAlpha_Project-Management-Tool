import { z } from 'zod';
import { validDate } from '../../shared/date.js';
import { taskStatuses, validResourceUrl } from '../../shared/task.js';
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
const checklistSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(100),
        text: z.string().trim().min(1).max(160),
        done: z.boolean(),
      })
      .strict(),
  )
  .max(20)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    'Checklist IDs must be unique.',
  );

const resourceSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    url: z
      .string()
      .trim()
      .max(2048)
      .refine(
        validResourceUrl,
        'Use an HTTP or HTTPS link without embedded credentials.',
      ),
  })
  .strict();

export const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    project: z.string().trim().min(1).max(60),
    description: z.string().trim().max(1000).default(''),
    notes: z.string().trim().max(3000).default(''),
    links: z.array(resourceSchema).max(8).default([]),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    status: z.enum(Object.keys(taskStatuses)).default('todo'),
    blockerReason: z.string().trim().max(500).default(''),
    due: z.string().refine(validDate, 'Enter a valid date.').default(''),
    checklist: checklistSchema.default([]),
  })
  .strict()
  .refine((value) => value.status !== 'blocked' || value.blockerReason.length > 0, {
    message: 'Explain what is blocking this task.',
    path: ['blockerReason'],
  });
// PATCH fields must not apply creation defaults to omitted values.
export const taskUpdateSchema = z
  .object({
    title: taskSchema.shape.title.optional(),
    project: taskSchema.shape.project.optional(),
    description: taskSchema.shape.description.removeDefault().optional(),
    notes: taskSchema.shape.notes.removeDefault().optional(),
    links: taskSchema.shape.links.removeDefault().optional(),
    priority: taskSchema.shape.priority.removeDefault().optional(),
    status: taskSchema.shape.status.removeDefault().optional(),
    blockerReason: taskSchema.shape.blockerReason.removeDefault().optional(),
    due: taskSchema.shape.due.removeDefault().optional(),
    checklist: checklistSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No changes supplied.')
  .refine((value) => value.blockerReason === undefined || Boolean(value.status), {
    message: 'Include the task status when changing its blocker.',
    path: ['blockerReason'],
  })
  .refine((value) => value.status !== 'blocked' || Boolean(value.blockerReason), {
    message: 'Explain what is blocking this task.',
    path: ['blockerReason'],
  })
  .refine(
    (value) => value.blockerReason !== '' || (value.status && value.status !== 'blocked'),
    {
      message: 'Choose a non-blocked status when clearing the blocker.',
      path: ['blockerReason'],
    },
  );
export const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(30),
    search: z.string().trim().max(120).default(''),
    project: z.string().trim().max(60).default(''),
    view: z.enum(['all', 'today', 'upcoming', 'blocked']).default('all'),
    date: z.string().refine(validDate, 'Enter a valid date.').default(''),
  })
  .strict()
  .refine(
    (value) => !['today', 'upcoming'].includes(value.view) || value.date !== '',
    'A date is required for daily planning.',
  );
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
