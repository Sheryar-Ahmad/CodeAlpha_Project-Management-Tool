const visibleFields = new Set([
  'title',
  'project',
  'description',
  'notes',
  'links',
  'priority',
  'status',
  'blockerReason',
  'due',
  'recurrence',
  'checklist',
  'estimateMinutes',
  'durationDays',
]);
export function taskActivity(user, action, fields = []) {
  return {
    actor: user?._id ?? null,
    name: user?.name ?? 'System',
    action,
    fields: fields.filter((field) => visibleFields.has(field)),
    at: new Date(),
  };
}
export function appendActivity(event) {
  return { activity: { $each: [event], $slice: -50 } };
}
