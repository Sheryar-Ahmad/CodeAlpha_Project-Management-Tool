import { taskSchema } from './validation.js';
import { z } from 'zod';
// Export metadata is accepted only as documented fields; ownership/session fields are rejected.
const rowSchema = taskSchema
  .safeExtend({
    id: z.string().max(100).optional(),
    parentTask: z.string().max(100).nullable().optional(),
    lifecycle: z.enum(['active', 'archived', 'trashed']).default('active'),
    repeatDay: z.number().int().min(1).max(31).optional(),
    repeatSource: z.string().max(100).optional(),
    createdAt: z.string().max(100).optional(),
    updatedAt: z.string().max(100).optional(),
  })
  .strict();
export const importFileSchema = z
  .object({
    format: z.literal('orbit-task-export'),
    version: z.literal(1),
    exportedAt: z.string().max(100),
    scope: z.enum(['account', 'demo']),
    tasks: z.array(rowSchema).min(1).max(100),
  })
  .strict();
export function importDrafts(file, project, makeId) {
  return file.tasks.map((row) => ({
    title: row.title,
    project,
    description: row.description,
    notes: row.notes,
    links: row.links,
    priority: row.priority,
    status: row.status,
    blockerReason: row.status === 'blocked' ? row.blockerReason : '',
    due: row.due,
    lifecycle: row.lifecycle,
    estimateMinutes: row.estimateMinutes,
    durationDays: row.durationDays,
    recurrence: 'none',
    checklist: row.checklist.map(({ text, done }) => ({ id: makeId(), text, done })),
  }));
}
