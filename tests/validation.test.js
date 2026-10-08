import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parse,
  validDate,
  taskSchema,
  taskUpdateSchema,
  querySchema,
  registerSchema,
} from '../server/lib/validation.js';
import { hashPassword, verifyPassword } from '../server/lib/password.js';

import { addDays, matchesPlanningView, summarizeProjects } from '../shared/planning.js';
import { initialTimer, remainingSeconds, validTimer } from '../client/lib/focus.js';
import { taskTemplates, createTemplateDraft } from '../client/lib/templates.js';

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
