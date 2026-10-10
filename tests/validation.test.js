import { hasDependencyCycle } from '../shared/dependencies.js';
import { timelinePosition } from '../shared/timeline.js';
import { weekBounds, validWorkLog, loggedTime } from '../shared/workLog.js';
import { readDemoWorkLogs, saveDemoWorkLogs } from '../client/lib/workLogs.js';
import { readDemoNotebook, saveDemoNotebook } from '../client/lib/notebook.js';
import {
  notebookKinds,
  validNotebookEntry,
  meetingFollowUp,
} from '../shared/notebook.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parse,
  validDate,
  taskSchema,
  taskUpdateSchema,
  querySchema,
  calendarQuerySchema,
  notebookSchema,
  notebookQuerySchema,
  workLogSchema,
  workLogQuerySchema,
  registerSchema,
  lifecycleSchema,
  projectSchema,
  projectUpdateSchema,
} from '../server/lib/validation.js';
import { hashPassword, verifyPassword } from '../server/lib/password.js';

import { attentionReasons } from '../shared/planning.js';
import { monthBounds, moveMonth, calendarWeeks } from '../shared/calendar.js';
import { addDays, matchesPlanningView, summarizeProjects } from '../shared/planning.js';
import { initialTimer, remainingSeconds, validTimer } from '../client/lib/focus.js';
import { taskTemplates, createTemplateDraft } from '../client/lib/templates.js';
import { demoOverview, readDemoProjects, saveDemoProjects } from '../client/lib/demo.js';
import { commandItems } from '../shared/commands.js';
import { combineProjects, validMilestones, projectHealth } from '../shared/project.js';
import { createTaskExport } from '../shared/export.js';
import { nextRecurringDate, nextRecurringDraft } from '../shared/recurrence.js';

test('dates reject impossible dates and accept leap days', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate(''), true);
});
test('task validation rejects operators, owner injection, and blank titles', () => {
  const base = { title: 'Task', project: 'Project' };
  assert.throws(() => parse(taskSchema, { ...base, title: { $ne: '' } }));
  assert.throws(() => parse(taskSchema, { ...base, owner: 'another-user' }));
  assert.throws(() => parse(taskSchema, { ...base, title: '  ' }));
  assert.throws(() => parse(taskSchema, { ...base, title: 'x'.repeat(121) }));
});
test('partial status updates do not overwrite other task fields', () => {
  assert.deepEqual(parse(taskUpdateSchema, { status: 'done' }), { status: 'done' });
  assert.throws(() => parse(taskUpdateSchema, {}));
});
test('queries bound pagination and reject nested operators', () => {
  assert.throws(() => parse(querySchema, { limit: '1000' }));
  assert.throws(() => parse(querySchema, { project: { $ne: '' } }));
  assert.equal(parse(querySchema, { page: '2' }).page, 2);
});
test('registration validates and normalizes email', () => {
  const parsed = parse(registerSchema, {
    name: ' Sheheryar ',
    email: 'Test@Example.com',
    password: 'long-passphrase-2026',
  });
  assert.equal(parsed.email, 'test@example.com');
  assert.throws(() => parse(registerSchema, { ...parsed, password: 'short' }));
});
test('password hashes are salted and compare correctly', async () => {
  const first = await hashPassword('a-long-test-passphrase');
  const second = await hashPassword('a-long-test-passphrase');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('a-long-test-passphrase', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
});

test('checklists reject duplicate IDs, oversized lists, and invalid fields', () => {
  const base = { title: 'Task', project: 'Project' };
  const step = { id: 'step-1', text: 'Prepare notes', done: false };
  assert.equal(parse(taskSchema, { ...base, checklist: [step] }).checklist.length, 1);
  assert.throws(() => parse(taskSchema, { ...base, checklist: [step, step] }));
  assert.throws(() =>
    parse(taskSchema, { ...base, checklist: [{ ...step, text: ' ' }] }),
  );
  assert.throws(() =>
    parse(taskSchema, {
      ...base,
      checklist: Array.from({ length: 21 }, (_, i) => ({ ...step, id: String(i) })),
    }),
  );
  assert.throws(() =>
    parse(taskSchema, { ...base, checklist: [{ ...step, owner: 'other-user' }] }),
  );
  assert.deepEqual(parse(taskUpdateSchema, { status: 'done' }), { status: 'done' });
});
test('planning date arithmetic handles month and year boundaries', () => {
  assert.equal(addDays('2026-12-29', 7), '2027-01-05');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});
test('Today includes overdue work while Upcoming excludes done and undated tasks', () => {
  assert.equal(
    matchesPlanningView({ status: 'todo', due: '2026-10-08' }, 'today', '2026-10-09'),
    true,
  );
  assert.equal(
    matchesPlanningView({ status: 'done', due: '2026-10-09' }, 'today', '2026-10-09'),
    false,
  );
  assert.equal(
    matchesPlanningView({ status: 'todo', due: '' }, 'upcoming', '2026-10-09'),
    false,
  );
  assert.equal(
    matchesPlanningView({ status: 'todo', due: '2026-10-16' }, 'upcoming', '2026-10-09'),
    true,
  );
  assert.equal(
    matchesPlanningView({ status: 'todo', due: '2026-10-17' }, 'upcoming', '2026-10-09'),
    false,
  );
  assert.throws(() => parse(querySchema, { view: 'today' }));
});
test('project summaries find unfinished deadlines and separate project labels', () => {
  const summaries = summarizeProjects(
    [
      { project: 'Home', status: 'done', due: '2026-01-01' },
      { project: 'Home', status: 'progress', due: '2026-10-10' },
      { project: 'Study', status: 'todo', due: '2026-10-08' },
    ],
    '2026-10-09',
  );
  assert.equal(summaries[0].nextDue, '2026-10-10');
  assert.equal(summaries[0].completed, 1);
  assert.equal(summaries[1].overdue, 1);
});

test('focus timer derives remaining time from a deadline rather than counting ticks', () => {
  const timer = { ...initialTimer(), deadline: 75000 };
  assert.equal(remainingSeconds(timer, 40000), 35);
  assert.equal(remainingSeconds(timer, 76000), 0);
  assert.equal(remainingSeconds({ ...initialTimer(), remaining: 45 }), 45);
});
test('focus storage rejects impossible state without accepting malformed data', () => {
  assert.equal(validTimer(initialTimer()), true);
  assert.equal(validTimer({ ...initialTimer(), remaining: -1 }), false);
  assert.equal(validTimer({ ...initialTimer(), duration: 999999 }), false);
  assert.equal(validTimer({ ...initialTimer(), deadline: 'not-a-time' }), false);
});

test('resource links reject executable protocols, credentials, and excessive context', () => {
  const base = { title: 'Task', project: 'Project' };
  const link = { label: 'Brief', url: 'https://example.com/brief' };
  assert.equal(
    parse(taskSchema, { ...base, links: [link], notes: ' Keep context ' }).notes,
    'Keep context',
  );
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,bad',
    'ftp://example.com/file',
    'https://user:secret@example.com',
  ]) {
    assert.throws(() => parse(taskSchema, { ...base, links: [{ ...link, url }] }));
  }
  assert.throws(() => parse(taskSchema, { ...base, notes: 'x'.repeat(3001) }));
  assert.throws(() => parse(taskSchema, { ...base, links: Array(9).fill(link) }));
  assert.deepEqual(parse(taskUpdateSchema, { status: 'done' }), { status: 'done' });
});

test('blocked tasks require a reason and safe transitions keep status and reason together', () => {
  const base = { title: 'Task', project: 'Project', status: 'blocked' };
  assert.throws(() => parse(taskSchema, base));
  assert.throws(() => parse(taskSchema, { ...base, blockerReason: '   ' }));
  assert.equal(
    parse(taskSchema, { ...base, blockerReason: 'Waiting for a decision' }).status,
    'blocked',
  );
  assert.throws(() => parse(taskUpdateSchema, { status: 'blocked' }));
  assert.throws(() => parse(taskUpdateSchema, { blockerReason: '' }));
  assert.throws(() => parse(taskUpdateSchema, { blockerReason: 'New reason' }));
  assert.deepEqual(parse(taskUpdateSchema, { status: 'todo', blockerReason: '' }), {
    status: 'todo',
    blockerReason: '',
  });
  assert.equal(parse(querySchema, { view: 'blocked' }).view, 'blocked');
  assert.equal(
    matchesPlanningView({ status: 'blocked', due: '' }, 'blocked', '2026-10-09'),
    true,
  );
});

test('template drafts satisfy task rules and do not share checklist state', () => {
  for (const template of taskTemplates) {
    const first = createTemplateDraft(template.id);
    const second = createTemplateDraft(template.id);
    const parsed = parse(taskSchema, { ...first, project: 'Personal project' });
    assert.equal(parsed.status, 'todo');
    assert.ok(first.checklist.every((step) => !step.done));
    assert.notEqual(first.checklist[0].id, second.checklist[0].id);
    first.checklist[0].done = true;
    assert.equal(second.checklist[0].done, false);
    assert.equal(createTemplateDraft(template.id).checklist[0].done, false);
  }
  assert.equal(createTemplateDraft('unknown'), null);
});

test('archive and trash are distinct from progress and excluded from active planning', () => {
  const tasks = [
    { project: 'Active', status: 'todo', due: '2026-01-01' },
    { project: 'Archived', status: 'progress', lifecycle: 'archived', due: '2026-01-01' },
    { project: 'Deleted', status: 'blocked', lifecycle: 'trashed', due: '2026-01-01' },
  ];
  assert.equal(matchesPlanningView(tasks[0], 'all', '2026-10-09'), true);
  for (const task of tasks.slice(1)) {
    for (const view of ['all', 'today', 'upcoming', 'blocked'])
      assert.equal(matchesPlanningView(task, view, '2026-10-09'), false);
  }
  assert.equal(matchesPlanningView(tasks[1], 'archived', '2026-10-09'), true);
  assert.equal(matchesPlanningView(tasks[2], 'trash', '2026-10-09'), true);
  const overview = demoOverview(tasks, '2026-10-09');
  assert.equal(overview.total, 1);
  assert.equal(overview.overdue, 1);
  assert.equal(overview.archived, 1);
  assert.equal(overview.trashed, 1);
  assert.deepEqual(overview.projects, ['Active']);
  assert.throws(() =>
    parse(taskSchema, { title: 'Injected', project: 'Project', lifecycle: 'trashed' }),
  );
  assert.throws(() => parse(lifecycleSchema, { action: 'purge' }));
  assert.throws(() => parse(lifecycleSchema, { action: 'restore', owner: 'other' }));
});

test('exports allowlist task data and strip internal fields at every nesting level', () => {
  const data = createTaskExport(
    [
      {
        id: 'export-1',
        title: 'My task',
        project: 'Home',
        lifecycle: 'archived',
        status: 'done',
        description: '',
        notes: 'My notes',
        priority: 'low',
        due: '',
        owner: 'private-owner',
        passwordHash: 'secret',
        links: [{ label: 'Reference', url: 'https://example.com', secret: 'hidden' }],
        checklist: [{ id: 'step', text: 'Finished', done: true, owner: 'hidden' }],
      },
    ],
    'demo',
  );
  assert.equal(data.version, 1);
  assert.equal(data.format, 'orbit-task-export');
  assert.equal(data.tasks[0].lifecycle, 'archived');
  assert.equal(data.tasks[0].notes, 'My notes');
  assert.equal(data.tasks[0].owner, undefined);
  assert.equal(data.tasks[0].passwordHash, undefined);
  assert.deepEqual(data.tasks[0].links, [
    { label: 'Reference', url: 'https://example.com' },
  ]);
  assert.deepEqual(data.tasks[0].checklist, [
    { id: 'step', text: 'Finished', done: true },
  ]);
});

test('recurrence uses calendar dates and preserves the monthly anchor across short months', () => {
  assert.equal(nextRecurringDate('2027-01-31', 'monthly', 31), '2027-02-28');
  assert.equal(nextRecurringDate('2027-02-28', 'monthly', 31), '2027-03-31');
  assert.equal(nextRecurringDate('2028-01-31', 'monthly', 31), '2028-02-29');
  assert.equal(nextRecurringDate('2026-12-31', 'daily'), '2027-01-01');
  assert.equal(nextRecurringDate('2026-12-28', 'weekly'), '2027-01-04');
  assert.equal(nextRecurringDate('2100-12-31', 'daily'), null);
  assert.equal(nextRecurringDate('', 'daily'), null);
  assert.throws(() =>
    parse(taskSchema, { title: 'Repeat', project: 'Home', recurrence: 'weekly' }),
  );
  assert.throws(() => parse(taskUpdateSchema, { recurrence: 'daily' }));
});

test('next occurrence keeps context without resetting the completed record', () => {
  const original = {
    title: 'Review',
    project: 'Home',
    description: 'Context',
    notes: 'Keep this',
    links: [],
    priority: 'medium',
    status: 'done',
    due: '2027-01-31',
    recurrence: 'monthly',
    repeatDay: 31,
    checklist: [{ id: 'old-step', text: 'Review notes', done: true }],
  };
  const next = nextRecurringDraft(original, () => 'fresh-step');
  assert.equal(next.due, '2027-02-28');
  assert.equal(next.status, 'todo');
  assert.equal(next.notes, 'Keep this');
  assert.deepEqual(next.checklist, [
    { id: 'fresh-step', text: 'Review notes', done: false },
  ]);
  assert.equal(original.status, 'done');
  assert.equal(original.checklist[0].done, true);
});

test('project dates, immutable names, and partial updates validate predictably', () => {
  const base = { name: 'New project', startDate: '2026-10-10', targetDate: '2026-10-20' };
  assert.equal(parse(projectSchema, base).status, 'planned');
  assert.throws(() => parse(projectSchema, { ...base, targetDate: '2026-10-09' }));
  assert.throws(() => parse(projectSchema, { name: { $ne: '' } }));
  assert.throws(() => parse(projectSchema, { ...base, owner: 'another-owner' }));
  assert.throws(() => parse(projectUpdateSchema, { name: 'Renamed' }));
  assert.throws(() => parse(projectUpdateSchema, { startDate: '2026-10-10' }));
  assert.throws(() => parse(projectUpdateSchema, {}));
  assert.deepEqual(parse(projectUpdateSchema, { description: ' Revised ' }), {
    description: 'Revised',
  });
  assert.deepEqual(parse(projectUpdateSchema, { startDate: '', targetDate: '' }), {
    startDate: '',
    targetDate: '',
  });
});

test('project metadata preserves group statistics and keeps empty projects visible', () => {
  const projects = combineProjects(
    [
      {
        name: 'Website',
        total: 3,
        completed: 1,
        active: 1,
        blocked: 1,
        overdue: 0,
        nextDue: '2026-10-20',
      },
    ],
    [
      { id: 'project-1', name: 'Website', description: 'Launch brief', status: 'active' },
      { id: 'project-2', name: 'Empty', status: 'planned' },
    ],
  );
  assert.equal(projects.length, 2);
  assert.equal(projects.find((project) => project.name === 'Website').total, 3);
  assert.equal(
    projects.find((project) => project.name === 'Website').description,
    'Launch brief',
  );
  assert.equal(projects.find((project) => project.name === 'Empty').total, 0);
  const overview = demoOverview([], '2026-10-09', [
    { id: 'project-2', name: 'Empty', status: 'planned' },
  ]);
  assert.deepEqual(overview.projects, ['Empty']);
  assert.equal(overview.total, 0);
});

test('demo project records reject corrupted storage and duplicate names without overwriting it', () => {
  const previous = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    assert.deepEqual(readDemoProjects(), []);
    const project = {
      id: 'demo-1',
      name: 'Project',
      description: '',
      startDate: '',
      targetDate: '',
      status: 'planned',
    };
    saveDemoProjects([project]);
    assert.equal(readDemoProjects()[0].name, 'Project');
    assert.throws(() => saveDemoProjects([project, { ...project, id: 'demo-2' }]));
    assert.equal(readDemoProjects().length, 1);
    storage.set('orbit.projects.v1', '{invalid');
    assert.throws(() => readDemoProjects(), /Reset the demo/);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test('calendar validation and weeks handle leap years and supported boundary months', () => {
  assert.deepEqual(monthBounds('2028-02'), { start: '2028-02-01', end: '2028-02-29' });
  assert.equal(monthBounds('2026-02').end, '2026-02-28');
  assert.equal(moveMonth('2026-12', 1), '2027-01');
  assert.equal(moveMonth('2000-01', -1), null);
  assert.equal(moveMonth('2100-12', 1), null);
  const weeks = calendarWeeks('2026-02');
  assert.equal(weeks[0][6], '2026-02-01');
  assert.equal(weeks.flat().filter(Boolean).length, 28);
  for (const input of [
    { month: '2026-13' },
    { month: '2026-1' },
    { month: { $ne: '' } },
    { month: '2026-10', owner: 'other' },
  ])
    assert.throws(() => parse(calendarQuerySchema, input));
  assert.throws(() => parse(querySchema, { view: 'attention' }));
});
test('attention rules deduplicate tasks while preserving all reasons and excluding recovered work', () => {
  const task = {
    lifecycle: 'active',
    status: 'blocked',
    priority: 'high',
    due: '2026-10-08',
  };
  assert.deepEqual(attentionReasons(task, '2026-10-09'), [
    'Blocked',
    'Overdue',
    'High priority',
  ]);
  assert.equal(matchesPlanningView(task, 'attention', '2026-10-09'), true);
  for (const lifecycle of ['archived', 'trashed'])
    assert.deepEqual(attentionReasons({ ...task, lifecycle }, '2026-10-09'), []);
  assert.deepEqual(attentionReasons({ ...task, status: 'done' }, '2026-10-09'), []);
  assert.deepEqual(
    attentionReasons(
      { status: 'todo', priority: 'low', due: '2026-10-12' },
      '2026-10-09',
    ),
    ['Due within 3 days'],
  );
  assert.deepEqual(
    attentionReasons(
      { status: 'todo', priority: 'low', due: '2026-10-13' },
      '2026-10-09',
    ),
    [],
  );
  assert.deepEqual(
    attentionReasons({ status: 'todo', priority: 'low', due: '' }, '2026-10-09'),
    [],
  );
});

test('milestones reject invalid dates, duplicate identities and unsafe fields without patch defaults', () => {
  const milestone = { id: 'one', title: 'Launch', due: '2026-10-30', done: false };
  const data = { name: 'Milestone project', milestones: [milestone] };
  assert.equal(validMilestones(data.milestones), true);
  assert.deepEqual(parse(projectSchema, data).milestones, [milestone]);
  assert.deepEqual(parse(projectUpdateSchema, { status: 'active' }), {
    status: 'active',
  });
  assert.deepEqual(parse(projectUpdateSchema, { milestones: [] }), { milestones: [] });
  for (const milestones of [
    [milestone, milestone],
    [{ ...milestone, due: '2026-02-30' }],
    [{ ...milestone, title: ' ' }],
    Array.from({ length: 21 }, (_, i) => ({ ...milestone, id: String(i) })),
    [{ ...milestone, owner: 'other' }],
  ])
    assert.throws(() => parse(projectSchema, { ...data, milestones }));
  assert.throws(() =>
    parse(registerSchema, {
      name: 'Tester',
      email: 'test@example.com',
      password: 'test-long-password',
      milestones: [],
    }),
  );
});
test('project health explains flags and does not imply a delivery forecast', () => {
  const base = {
    total: 2,
    completed: 1,
    blocked: 0,
    overdue: 0,
    status: 'active',
    targetDate: '2026-10-20',
    milestones: [],
  };
  assert.deepEqual(projectHealth(base, '2026-10-09'), {
    label: 'No current flags',
    reasons: [],
  });
  const warning = projectHealth(
    {
      ...base,
      blocked: 1,
      overdue: 1,
      status: 'onhold',
      targetDate: '2026-10-08',
      milestones: [{ done: false, due: '2026-10-08' }],
    },
    '2026-10-09',
  );
  assert.equal(warning.label, 'Needs attention');
  assert.deepEqual(warning.reasons, [
    '1 blocked tasks',
    '1 overdue tasks',
    '1 overdue milestones',
    'Project target date has passed',
    'Project is on hold',
  ]);
  assert.equal(
    projectHealth({ ...base, status: 'completed' }, '2026-10-09').reasons[0],
    'Marked complete with unfinished work',
  );
  assert.deepEqual(projectHealth({ ...base, total: 0, completed: 0 }, '2026-10-09'), {
    label: 'No work added yet',
    reasons: [],
  });
});
test('command search is bounded and task search preserves the entered literal query', () => {
  const views = {
    all: { label: 'Task board', description: 'All work' },
    calendar: { label: 'Calendar', description: 'Deadlines' },
  };
  const result = commandItems('Launch', views, ['Website launch']);
  assert.equal(result[0].kind, 'project');
  assert.equal(result[0].value, 'Website launch');
  assert.equal(result.at(-1).kind, 'search');
  assert.equal(result.at(-1).value, 'Launch');
  assert.equal(commandItems('Calendar', views, [])[0].value, 'calendar');
  assert.equal(
    commandItems(
      '',
      views,
      Array.from({ length: 50 }, (_, i) => 'Project ' + i),
    ).length,
    12,
  );
  assert.equal(commandItems('[a].*', views, []).at(-1).value, '[a].*');
});

test('notebook entries validate dates, plain content and strict payloads', () => {
  const base = {
    kind: 'decision',
    title: 'Choose hosting',
    body: 'Use one provider',
    date: '2026-10-09',
  };
  assert.equal(validNotebookEntry(base), true);
  assert.deepEqual(parse(notebookSchema, base), base);
  for (const change of [
    { kind: 'script' },
    { title: ' ' },
    { body: ' ' },
    { body: 'x'.repeat(3001) },
    { date: '' },
    { date: '2026-02-30' },
    { owner: 'other' },
    { project: 'other' },
  ])
    assert.throws(() => parse(notebookSchema, { ...base, ...change }));
  assert.throws(() => parse(notebookQuerySchema, { page: 0 }));
  assert.throws(() => parse(notebookQuerySchema, { kind: { $ne: '' } }));
  assert.equal(Object.keys(notebookKinds).length, 3);
});
test('meeting follow-ups become editable task drafts without recurrence or silent assignment', () => {
  const draft = meetingFollowUp(
    {
      kind: 'meeting',
      title: 'Launch review',
      body: 'Discuss accessibility',
      date: '2026-10-09',
    },
    'Launch',
  );
  const task = parse(taskSchema, draft);
  assert.equal(task.project, 'Launch');
  assert.equal(task.title, 'Follow up: Launch review');
  assert.equal(task.status, 'todo');
  assert.equal(task.due, '');
  assert.equal(task.recurrence, 'none');
  assert.deepEqual(task.checklist, []);
});

test('weekly work logs validate bounds, integer minutes and calendar boundaries', () => {
  assert.deepEqual(weekBounds('2026-12-29'), { start: '2026-12-28', end: '2027-01-03' });
  assert.deepEqual(weekBounds('2000-01-01'), { start: '2000-01-01', end: '2000-01-02' });
  assert.deepEqual(weekBounds('2100-12-31'), { start: '2100-12-27', end: '2100-12-31' });
  assert.equal(loggedTime(135), '2h 15m');
  assert.equal(loggedTime(60), '1h');
  const base = {
    activity: 'Research',
    project: 'Launch',
    date: '2026-10-09',
    minutes: 30,
    notes: '',
  };
  assert.equal(validWorkLog(base), true);
  assert.deepEqual(parse(workLogSchema, base), base);
  for (const change of [
    { minutes: 0 },
    { minutes: 1.5 },
    { minutes: 1441 },
    { minutes: '30' },
    { activity: ' ' },
    { project: { $ne: '' } },
    { date: '2026-02-30' },
    { owner: 'other' },
  ])
    assert.throws(() => parse(workLogSchema, { ...base, ...change }));
  assert.throws(() => parse(workLogQuerySchema, { date: '' }));
});
test('local notebook and work log storage reject corruption and preserve valid records', () => {
  const original = globalThis.localStorage,
    storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  try {
    const log = {
      id: 'log-one',
      activity: 'Research',
      project: 'Launch',
      date: '2026-10-09',
      minutes: 30,
      notes: '',
    };
    saveDemoWorkLogs([log]);
    assert.deepEqual(readDemoWorkLogs(), [log]);
    assert.throws(() => saveDemoWorkLogs([log, log]));
    assert.deepEqual(readDemoWorkLogs(), [log]);
    const note = {
      id: 'note-one',
      projectId: 'project-one',
      kind: 'decision',
      title: 'Choose hosting',
      body: 'Review costs',
      date: '2026-10-09',
    };
    saveDemoNotebook([note]);
    assert.deepEqual(readDemoNotebook(), [note]);
    assert.throws(() => saveDemoNotebook([note, note]));
    assert.deepEqual(readDemoNotebook(), [note]);
    storage.set('orbit.work-logs.v1', 'invalid');
    assert.throws(readDemoWorkLogs, /Reset the demo/);
    storage.set('orbit.project-notes.v1', 'invalid');
    assert.throws(readDemoNotebook, /Reset the demo/);
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test('project timelines clip dates and distinguish checkpoints, missing dates and outside ranges', () => {
  assert.deepEqual(timelinePosition({}, '2026-10'), { kind: 'undated' });
  assert.deepEqual(
    timelinePosition({ startDate: '2026-11-01', targetDate: '2026-11-30' }, '2026-10'),
    { kind: 'outside' },
  );
  assert.deepEqual(
    timelinePosition({ startDate: '2026-09-01', targetDate: '2026-11-30' }, '2026-10'),
    { kind: 'span', left: 0, width: 100 },
  );
  const checkpoint = timelinePosition({ targetDate: '2028-02-29' }, '2028-02');
  assert.equal(checkpoint.kind, 'checkpoint');
  assert.equal(checkpoint.left, (28 / 29) * 100);
  assert.equal(checkpoint.width, (1 / 29) * 100);
});

test('dependency cycle checks handle indirect loops, separate chains and empty graphs', () => {
  assert.equal(hasDependencyCycle([]), false);
  assert.equal(
    hasDependencyCycle([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]),
    false,
  );
  assert.equal(
    hasDependencyCycle([
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
    ]),
    true,
  );
  assert.equal(hasDependencyCycle([{ from: 'a', to: 'a' }]), true);
  assert.equal(
    hasDependencyCycle([
      { from: 'a', to: 'b' },
      { from: 'x', to: 'y' },
    ]),
    false,
  );
});
