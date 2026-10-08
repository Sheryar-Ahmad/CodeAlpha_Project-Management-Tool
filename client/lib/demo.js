import { today } from './api.js';
import { addDays, summarizeProjects } from '../../shared/planning.js';
import { validDate } from '../../shared/date.js';
import { validResourceUrl } from '../../shared/task.js';
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
    (task.notes === undefined ||
      (typeof task.notes === 'string' && task.notes.length <= 3000)) &&
    (task.links === undefined ||
      (Array.isArray(task.links) &&
        task.links.length <= 8 &&
        task.links.every(
          (link) =>
            link &&
            typeof link.label === 'string' &&
            link.label.trim().length > 0 &&
            link.label.length <= 100 &&
            typeof link.url === 'string' &&
            link.url.length <= 2048 &&
            validResourceUrl(link.url),
        ))) &&
    ['todo', 'progress', 'done'].includes(task.status) &&
    ['low', 'medium', 'high'].includes(task.priority) &&
    (task.checklist === undefined ||
      (Array.isArray(task.checklist) &&
        task.checklist.length <= 20 &&
        task.checklist.every(
          (step) =>
            step &&
            typeof step.id === 'string' &&
            step.id.length > 0 &&
            step.id.length <= 100 &&
            typeof step.text === 'string' &&
            step.text.trim().length > 0 &&
            step.text.length <= 160 &&
            typeof step.done === 'boolean',
        ) &&
        new Set(task.checklist.map((step) => step.id)).size === task.checklist.length)) &&
    typeof task.due === 'string' &&
    validDate(task.due)
  );
}
function seedTasks() {
  const date = today();
  return structuredClone(samples).map((task) => ({
    ...task,
    notes: '',
    links: [],
    due:
      task.id === 'sample-2'
        ? date
        : task.id === 'sample-3'
          ? addDays(date, 1)
          : task.id === 'sample-4'
            ? addDays(date, 3)
            : task.id === 'sample-5'
              ? addDays(date, -1)
              : '',
    checklist:
      task.id === 'sample-4'
        ? [
            { id: 'presentation-1', text: 'Gather references', done: true },
            { id: 'presentation-2', text: 'Draft the key points', done: false },
            { id: 'presentation-3', text: 'Rehearse the walkthrough', done: false },
          ]
        : [],
  }));
}
export function readDemo() {
  const raw = localStorage.getItem(key);
  if (raw === null) return seedTasks();
  const tasks = JSON.parse(raw);
  if (
    !Array.isArray(tasks) ||
    tasks.length > 500 ||
    !tasks.every(isTask) ||
    new Set(tasks.map((task) => task.id)).size !== tasks.length
  )
    throw new Error('Local demo data is invalid. Reset the demo to recover.');
  return tasks.map((task) => ({
    ...task,
    checklist: task.checklist ?? [],
    notes: task.notes ?? '',
    links: task.links ?? [],
  }));
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
  saveDemo(seedTasks());
}
export function demoOverview(tasks, date) {
  return {
    total: tasks.length,
    active: tasks.filter((task) => task.status === 'progress').length,
    completed: tasks.filter((task) => task.status === 'done').length,
    overdue: tasks.filter((task) => task.due && task.due < date && task.status !== 'done')
      .length,
    projectSummaries: summarizeProjects(tasks, date),
    projects: [...new Set(tasks.map((task) => task.project))].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}
