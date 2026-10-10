import { today } from './api.js';
import { addDays, summarizeProjects } from '../../shared/planning.js';
import { validDate } from '../../shared/date.js';
import { taskStatuses, validResourceUrl } from '../../shared/task.js';
import { recurrenceLabels } from '../../shared/recurrence.js';
import {
  projectStatuses,
  validMilestones,
  validProjectDates,
  combineProjects,
} from '../../shared/project.js';
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
    (task.lifecycle === undefined ||
      ['active', 'archived', 'trashed'].includes(task.lifecycle)) &&
    (task.projectId === undefined ||
      (typeof task.projectId === 'string' &&
        task.projectId.length > 0 &&
        task.projectId.length <= 100)) &&
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
    (task.estimateMinutes === undefined ||
      (Number.isInteger(task.estimateMinutes) &&
        task.estimateMinutes >= 0 &&
        task.estimateMinutes <= 60000)) &&
    Object.hasOwn(taskStatuses, task.status) &&
    (task.blockerReason === undefined ||
      (typeof task.blockerReason === 'string' && task.blockerReason.length <= 500)) &&
    (task.status !== 'blocked' || Boolean(task.blockerReason?.trim())) &&
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
    (task.recurrence === undefined || Object.hasOwn(recurrenceLabels, task.recurrence)) &&
    (!task.recurrence || task.recurrence === 'none' || Boolean(task.due)) &&
    (task.repeatDay === undefined ||
      (Number.isInteger(task.repeatDay) &&
        task.repeatDay >= 1 &&
        task.repeatDay <= 31)) &&
    [task.repeatSource, task.repeatNext].every(
      (value) =>
        value === undefined ||
        (typeof value === 'string' && value.length > 0 && value.length <= 100),
    ) &&
    typeof task.due === 'string' &&
    validDate(task.due)
  );
}
function seedTasks() {
  const date = today();
  return structuredClone(samples).map((task) => ({
    ...task,
    lifecycle: 'active',
    recurrence: 'none',
    blockerReason: '',
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
    lifecycle: task.lifecycle ?? 'active',
    recurrence: task.recurrence ?? 'none',
    checklist: task.checklist ?? [],
    notes: task.notes ?? '',
    blockerReason: task.blockerReason ?? '',
    links: task.links ?? [],
  }));
}
export function saveDemo(tasks) {
  if (tasks.length > 500) throw new Error('The demo supports up to 500 tasks.');
  if (!tasks.every(isTask))
    throw new Error('Please check your task fields before saving.');
  try {
    localStorage.setItem(key, JSON.stringify(tasks));
  } catch {
    throw new Error('Could not save. Browser storage may be disabled or full.');
  }
}
export function resetDemo() {
  saveDemo(seedTasks());
  localStorage.removeItem('orbit.projects.v1');
  localStorage.removeItem('orbit.project-notes.v1');
  localStorage.removeItem('orbit.work-logs.v1');
}
export function demoOverview(all, date, records = []) {
  const tasks = all.filter((task) => !task.lifecycle || task.lifecycle === 'active');
  return {
    archived: all.filter((task) => task.lifecycle === 'archived').length,
    trashed: all.filter((task) => task.lifecycle === 'trashed').length,
    total: tasks.length,
    active: tasks.filter((task) => task.status === 'progress').length,
    blocked: tasks.filter((task) => task.status === 'blocked').length,
    completed: tasks.filter((task) => task.status === 'done').length,
    overdue: tasks.filter((task) => task.due && task.due < date && task.status !== 'done')
      .length,
    projectSummaries: combineProjects(summarizeProjects(tasks, date), records),
    projects: [
      ...new Set([
        ...tasks.map((task) => task.project),
        ...records.map((record) => record.name),
      ]),
    ].sort((a, b) => a.localeCompare(b)),
  };
}

function validProjectRecords(projects) {
  return (
    Array.isArray(projects) &&
    projects.length <= 1000 &&
    projects.every(
      (project) =>
        project &&
        typeof project.id === 'string' &&
        project.id.length > 0 &&
        project.id.length <= 100 &&
        typeof project.name === 'string' &&
        project.name.trim().length > 0 &&
        project.name.length <= 60 &&
        typeof project.description === 'string' &&
        project.description.length <= 1000 &&
        typeof project.startDate === 'string' &&
        typeof project.targetDate === 'string' &&
        validProjectDates(project.startDate, project.targetDate) &&
        (project.milestones === undefined || validMilestones(project.milestones)) &&
        Object.hasOwn(projectStatuses, project.status),
    ) &&
    new Set(projects.map((project) => project.id)).size === projects.length &&
    new Set(projects.map((project) => project.name)).size === projects.length
  );
}
export function readDemoProjects() {
  try {
    const projects = JSON.parse(localStorage.getItem('orbit.projects.v1') ?? '[]');
    if (!validProjectRecords(projects)) throw new Error('Invalid records');
    return projects;
  } catch {
    throw new Error(
      'Local project details could not be read. Reset the demo to recover.',
    );
  }
}
export function saveDemoProjects(projects) {
  if (!validProjectRecords(projects))
    throw new Error(
      'Check project names, dates, and status. Names must be unique. The demo supports up to 1,000 project records.',
    );
  try {
    localStorage.setItem('orbit.projects.v1', JSON.stringify(projects));
  } catch {
    throw new Error(
      'Project details could not be saved. Browser storage may be disabled or full.',
    );
  }
}

export function ensureDemoProject(name) {
  const records = readDemoProjects();
  const existing = records.find((project) => project.name === name);
  if (existing) return existing;
  const project = {
    id: crypto.randomUUID(),
    name,
    description: '',
    startDate: '',
    targetDate: '',
    status: 'planned',
    milestones: [],
  };
  saveDemoProjects([...records, project]);
  return project;
}
