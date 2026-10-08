/* Orbit | Copyright (c) 2026 Sheheryar Ahmad | See NOTICE. */
'use strict';
// Keep the demo state separate from rendering so a future API can replace storage.
const STORAGE_KEY = 'orbit.tasks.v1';
const statuses = { todo: 'To do', progress: 'In progress', done: 'Done' };
const priorities = ['low', 'medium', 'high'];
const $ = (selector) => document.querySelector(selector);
const localDate = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};
const validDate = (value) => {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return value >= '2000-01-01' && value <= '2100-12-31'
    && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const validTask = (task) => task && typeof task.id === 'string' && task.id.length <= 100
  && typeof task.title === 'string' && task.title.trim().length > 0 && task.title.length <= 120
  && typeof task.project === 'string' && task.project.trim().length > 0 && task.project.length <= 60
  && typeof task.description === 'string' && task.description.length <= 1000
  && Object.hasOwn(statuses, task.status) && priorities.includes(task.priority)
  && typeof task.due === 'string' && validDate(task.due);
const seedTasks = () => [
  { id: 'sample-1', title: 'Map the user journey', project: 'Website launch', description: 'Sketch the steps from landing page to first completed task.', priority: 'high', status: 'done', due: '' },
  { id: 'sample-2', title: 'Build the homepage', project: 'Website launch', description: 'Keep the message clear and the layout comfortable on mobile.', priority: 'high', status: 'progress', due: '' },
  { id: 'sample-3', title: 'Review accessibility', project: 'Website launch', description: 'Check keyboard navigation, labels, and readable contrast.', priority: 'medium', status: 'todo', due: '' },
  { id: 'sample-4', title: 'Outline the presentation', project: 'Semester project', description: 'Introduce the problem, walk through the solution, and show what we learned.', priority: 'medium', status: 'todo', due: '' },
  { id: 'sample-5', title: 'Organize research notes', project: 'Semester project', description: 'Bring the references and findings into one place.', priority: 'low', status: 'progress', due: '' },
  { id: 'sample-6', title: 'Define the project scope', project: 'Semester project', description: 'Agree on a focused first milestone.', priority: 'medium', status: 'done', due: '' }
];
function notify(message, error = false) {
  $('#notice').textContent = message;
  $('#notice').classList.toggle('error', error);
}
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return seedTasks();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 500 || !parsed.every(validTask)
      || new Set(parsed.map(task => task.id)).size !== parsed.length) throw new Error('Invalid stored tasks');
    return parsed;
  } catch {
    notify('Saved data could not be read. Sample tasks are shown; changes will replace the stored data.', true);
    return seedTasks();
  }
}
let tasks = loadTasks();
let editingId = null;
let fallbackCounter = 0;
function persist(nextTasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTasks));
    tasks = nextTasks;
    render();
    notify('Changes saved in this browser.');
    return true;
  } catch {
    notify('Could not save. Browser storage may be full or disabled. Your change was not applied.', true);
    return false;
  }
}
// User input is always inserted as text, never interpreted as HTML.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function card(task) {
  const article = element('article', 'task-card');
  const top = element('div', 'card-top');
  top.append(element('span', 'project-name', task.project),
    element('span', 'tag priority-' + task.priority, task.priority[0].toUpperCase() + task.priority.slice(1)));
  article.append(top, element('h3', 'task-title', task.title));
  if (task.description) article.append(element('p', 'task-description', task.description));
  const overdue = task.due && task.due < localDate() && task.status !== 'done';
  const dateText = task.due ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(task.due + 'T12:00:00')) : 'No due date';
  article.append(element('div', 'task-date' + (overdue ? ' is-overdue' : ''), (overdue ? 'Overdue · ' : '') + dateText));
  const actions = element('div', 'task-actions');
  const select = element('select');
  select.setAttribute('aria-label', 'Status for ' + task.title);
  for (const [value, label] of Object.entries(statuses)) {
    const option = element('option', '', label);
    option.value = value;
    select.append(option);
  }
  select.value = task.status;
  select.addEventListener('change', () => {
    const selected = select.value;
    if (!persist(tasks.map(item => item.id === task.id ? { ...item, status: selected } : item))) select.value = task.status;
    else document.getElementById('status-' + task.id)?.focus();
  });
  select.id = 'status-' + task.id;
  const edit = element('button', 'text-button', 'Edit');
  edit.type = 'button';
  edit.setAttribute('aria-label', 'Edit ' + task.title);
  edit.addEventListener('click', () => openForm(task));
  const remove = element('button', 'text-button delete-button', 'Delete');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Delete ' + task.title);
  remove.addEventListener('click', () => {
    if (window.confirm('Delete “' + task.title + '”? This cannot be undone.')) {
      if (persist(tasks.filter(item => item.id !== task.id))) $('#new-task').focus();
    }
  });
  actions.append(select, edit, remove);
  article.append(actions);
  return article;
}
function render() {
  $('#total').textContent = tasks.length;
  $('#in-progress').textContent = tasks.filter(task => task.status === 'progress').length;
  $('#completed').textContent = tasks.filter(task => task.status === 'done').length;
  $('#overdue').textContent = tasks.filter(task => task.due && task.due < localDate() && task.status !== 'done').length;
  const filter = $('#project-filter');
  const selectedProject = filter.value;
  filter.replaceChildren(new Option('All projects', ''));
  const projects = [...new Set(tasks.map(task => task.project))].sort((a, b) => a.localeCompare(b));
  projects.forEach(project => filter.add(new Option(project, project)));
  filter.value = projects.includes(selectedProject) ? selectedProject : '';
  const query = $('#search').value.trim().toLocaleLowerCase();
  const visible = tasks.filter(task => (!filter.value || task.project === filter.value)
    && (task.title + ' ' + task.description + ' ' + task.project).toLocaleLowerCase().includes(query));
  const board = $('#board');
  board.replaceChildren();
  for (const [status, label] of Object.entries(statuses)) {
    const column = element('section', 'column');
    const heading = element('h3', 'column-heading');
    heading.id = 'column-' + status;
    column.setAttribute('aria-labelledby', heading.id);
    const items = visible.filter(task => task.status === status);
    heading.append(element('span', 'dot ' + (status === 'progress' ? 'progress-dot' : status === 'done' ? 'done-dot' : '')),
      document.createTextNode(label), element('span', 'count', items.length));
    column.append(heading);
    items.forEach(task => column.append(card(task)));
    if (!items.length) column.append(element('p', 'empty', query || filter.value ? 'No matching tasks.' : 'No tasks here yet.'));
    board.append(column);
  }
}
function openForm(task = null) {
  editingId = task?.id ?? null;
  $('#task-form').reset();
  $('#form-error').textContent = '';
  $('#dialog-title').textContent = task ? 'Edit task' : 'New task';
  if (task) {
    for (const key of ['title', 'project', 'description', 'priority', 'due', 'status']) $('#task-form').elements.namedItem(key).value = task[key];
  }
  $('#task-dialog').showModal();
  $('#task-form').elements.namedItem('title').focus();
}
$('#new-task').addEventListener('click', () => openForm());
for (const selector of ['#close-dialog', '#cancel']) $(selector).addEventListener('click', () => $('#task-dialog').close());
$('#task-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!editingId && tasks.length >= 500) {
    $('#form-error').textContent = 'This demo supports up to 500 tasks. Delete a task before adding another.';
    return;
  }
  const data = new FormData(event.currentTarget);
  const task = {
    id: editingId ?? (globalThis.crypto?.randomUUID?.() ?? 'task-' + Date.now() + '-' + (++fallbackCounter)),
    title: String(data.get('title')).trim(),
    project: String(data.get('project')).trim(),
    description: String(data.get('description')).trim(),
    priority: String(data.get('priority')), due: String(data.get('due')), status: String(data.get('status'))
  };
  if (!validTask(task)) {
    $('#form-error').textContent = 'Enter a title, project, and valid date. Please check the field limits.';
    return;
  }
  const next = editingId ? tasks.map(item => item.id === editingId ? task : item) : [...tasks, task];
  if (persist(next)) $('#task-dialog').close();
  else $('#form-error').textContent = 'Could not save. Check the storage message on the dashboard.';
});
$('#search').addEventListener('input', render);
$('#project-filter').addEventListener('change', render);
$('#reset').addEventListener('click', () => {
  if (window.confirm('Replace all your local tasks with sample tasks? This cannot be undone.')) persist(seedTasks());
});
render();
