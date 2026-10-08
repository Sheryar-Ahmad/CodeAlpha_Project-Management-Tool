import { validDate } from '../../shared/date.js';
const key = 'orbit.tasks.v1';
const samples = [
  {
    id: 'sample-1',
    title: 'Map the user journey',
    project: 'Website launch',
    description: 'Sketch the path from a first visit to a completed task.',
    priority: 'high',
    status: 'done',
    due: '',
  },
  {
    id: 'sample-2',
    title: 'Build the homepage',
    project: 'Website launch',
    description: 'Make the first impression clear, welcoming, and useful.',
    priority: 'high',
    status: 'progress',
    due: '',
  },
  {
    id: 'sample-3',
    title: 'Review accessibility',
    project: 'Website launch',
    description: 'Check keyboard navigation, readable contrast, and form labels.',
    priority: 'medium',
    status: 'todo',
    due: '',
  },
  {
    id: 'sample-4',
    title: 'Outline the presentation',
    project: 'Semester project',
    description: 'Start with the problem. Show the solution. Share what we learned.',
    priority: 'medium',
    status: 'todo',
    due: '',
  },
  {
    id: 'sample-5',
    title: 'Organize research notes',
    project: 'Semester project',
    description: 'Bring references and findings into one place.',
    priority: 'low',
    status: 'progress',
    due: '',
  },
  {
    id: 'sample-6',
    title: 'Define the project scope',
    project: 'Semester project',
    description: 'Agree on the first milestone and keep it achievable.',
    priority: 'medium',
    status: 'done',
    due: '',
  },
];
function isTask(task) {
  return (
    task &&
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    task.title.trim() &&
    task.title.length <= 120 &&
    typeof task.project === 'string' &&
    task.project.trim() &&
    task.project.length <= 60 &&
    typeof task.description === 'string' &&
    task.description.length <= 1000 &&
    ['todo', 'progress', 'done'].includes(task.status) &&
    ['low', 'medium', 'high'].includes(task.priority) &&
    typeof task.due === 'string' &&
    validDate(task.due)
  );
}
export function readDemo() {
  const raw = localStorage.getItem(key);
  if (raw === null) return structuredClone(samples);
  const tasks = JSON.parse(raw);
  if (
    !Array.isArray(tasks) ||
    tasks.length > 500 ||
    !tasks.every(isTask) ||
    new Set(tasks.map((task) => task.id)).size !== tasks.length
  )
    throw new Error('Local demo data is invalid. Reset the demo to recover.');
  return tasks;
}
export function saveDemo(tasks) {
  if (tasks.length > 500) throw new Error('The demo supports up to 500 tasks.');
  try {
    localStorage.setItem(key, JSON.stringify(tasks));
  } catch {
    throw new Error('Could not save. Browser storage may be disabled or full.');
  }
}
export function resetDemo() {
  saveDemo(structuredClone(samples));
}
export function demoOverview(tasks, date) {
  return {
    total: tasks.length,
    active: tasks.filter((task) => task.status === 'progress').length,
    completed: tasks.filter((task) => task.status === 'done').length,
    overdue: tasks.filter((task) => task.due && task.due < date && task.status !== 'done')
      .length,
    projects: [...new Set(tasks.map((task) => task.project))].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}
