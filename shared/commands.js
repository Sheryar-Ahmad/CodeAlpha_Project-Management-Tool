// Commands navigate existing workflows; task search always goes to the full board.
export function commandItems(query, views, projects) {
  const text = query.trim().toLocaleLowerCase();
  const items = [
    { id: 'new-task', label: 'Create a task', kind: 'task', keywords: 'new add task' },
    {
      id: 'new-project',
      label: 'Create a project',
      kind: 'createProject',
      keywords: 'new add project',
    },
    ...Object.entries(views).map(([value, view]) => ({
      id: 'view-' + value,
      label: 'Open ' + view.label,
      kind: 'view',
      value,
      keywords: view.description,
    })),
    ...projects.map((name) => ({
      id: 'project-' + name,
      label: 'View tasks: ' + name,
      kind: 'project',
      value: name,
      keywords: 'project',
    })),
  ];
  const results = items
    .filter((item) =>
      (item.label + ' ' + item.keywords).toLocaleLowerCase().includes(text),
    )
    .slice(0, 12);
  if (text)
    results.push({
      id: 'search',
      label: 'Search all tasks for “' + query.trim() + '”',
      kind: 'search',
      value: query.trim(),
    });
  return results;
}
