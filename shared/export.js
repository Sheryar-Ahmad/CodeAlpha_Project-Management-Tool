// Export only documented task fields, never session data or internal ownership fields.
export function createTaskExport(tasks, scope) {
  return {
    format: 'orbit-task-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    scope,
    tasks: tasks.map((task) => ({
      id: task.id,
      lifecycle: task.lifecycle ?? 'active',
      title: task.title,
      project: task.project,
      description: task.description,
      notes: task.notes ?? '',
      links: (task.links ?? []).map(({ label, url }) => ({ label, url })),
      priority: task.priority,
      estimateMinutes: task.estimateMinutes ?? 0,
      status: task.status,
      blockerReason: task.blockerReason ?? '',
      due: task.due,
      recurrence: task.recurrence ?? 'none',
      ...(task.repeatDay ? { repeatDay: task.repeatDay } : {}),
      ...(task.repeatSource ? { repeatSource: task.repeatSource } : {}),
      checklist: (task.checklist ?? []).map(({ id, text, done }) => ({ id, text, done })),
      ...(task.createdAt ? { createdAt: task.createdAt } : {}),
      ...(task.updatedAt ? { updatedAt: task.updatedAt } : {}),
    })),
  };
}
