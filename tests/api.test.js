import { WorkRequest } from '../server/models/WorkRequest.js';
import { ProjectDependencies } from '../server/models/ProjectDependencies.js';
import { TaskReview } from '../server/models/TaskReview.js';
import { TaskComment } from '../server/models/TaskComment.js';
import { ProjectMember } from '../server/models/ProjectMember.js';
import { WorkLog } from '../server/models/WorkLog.js';
import { ProjectNote } from '../server/models/ProjectNote.js';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../server/app.js';
import { User } from '../server/models/User.js';
import { Session } from '../server/models/Session.js';
import { Task } from '../server/models/Task.js';
import { Project } from '../server/models/Project.js';

import { MongoRateStore } from '../server/lib/rateStore.js';
import { RateBucket } from '../server/models/RateBucket.js';

const origin = 'http://127.0.0.1:5173';
let mongo, alice, bob, taskId;
before(async () => {
  process.env.APP_ORIGIN = origin;
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([
    User.init(),
    Session.init(),
    Task.init(),
    Project.init(),
    ProjectMember.init(),
    TaskComment.init(),
    TaskReview.init(),
    ProjectDependencies.init(),
    WorkRequest.init(),
    ProjectNote.init(),
    WorkLog.init(),
    RateBucket.init(),
  ]);
  alice = request.agent(app);
  bob = request.agent(app);
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test('health check exposes no database credentials', async () => {
  const result = await request(app).get('/api/health').expect(200);
  assert.deepEqual(result.body, { status: 'ok' });
});
test('anonymous task access and foreign mutation origins are rejected', async () => {
  await request(app).get('/api/tasks').expect(401);
  await request(app)
    .post('/api/auth/register')
    .set('Origin', 'https://foreign.example')
    .send({})
    .expect(403);
  await request(app).post('/api/auth/register').send({}).expect(403);
});
test('registration returns safe user fields and HttpOnly cookie', async () => {
  const result = await alice
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'alice-long-passphrase',
    })
    .expect(201);
  assert.equal(result.body.user.name, 'Alice');
  assert.equal(result.body.user.passwordHash, undefined);
  assert.match(result.headers['set-cookie'][0], /HttpOnly/);
  assert.match(result.headers['set-cookie'][0], /SameSite=Lax/);
  await bob
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({ name: 'Bob', email: 'bob@example.com', password: 'bob-long-passphrase' })
    .expect(201);
});
test('duplicate accounts and malformed login payloads fail safely', async () => {
  await alice
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'alice-long-passphrase',
    })
    .expect(409);
  await request(app)
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: { $ne: null }, password: 'password' })
    .expect(400);
  await request(app)
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'alice@example.com', password: 'wrong-password' })
    .expect(401);
});
test('create, list, and update tasks without losing omitted fields', async () => {
  const created = await alice
    .post('/api/tasks')
    .set('Origin', origin)
    .send({
      title: 'Task [alpha]',
      project: 'Planning',
      description: 'Keep this description',
      priority: 'high',
      due: '2026-01-01',
    })
    .expect(201);
  taskId = created.body.task.id;
  const updated = await alice
    .patch('/api/tasks/' + taskId)
    .set('Origin', origin)
    .send({ status: 'done' })
    .expect(200);
  assert.equal(updated.body.task.description, 'Keep this description');
  assert.equal(updated.body.task.priority, 'high');
  assert.equal(updated.body.task.due, '2026-01-01');
  const result = await alice.get('/api/tasks?search=%5Balpha%5D').expect(200);
  assert.equal(result.body.tasks.length, 1);
  await alice
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ title: 'Blank', project: '  ' })
    .expect(400);
});
test('another user cannot read, edit, or delete the owner task', async () => {
  const result = await bob.get('/api/tasks').expect(200);
  assert.deepEqual(result.body.tasks, []);
  await bob
    .patch('/api/tasks/' + taskId)
    .set('Origin', origin)
    .send({ title: 'Stolen' })
    .expect(404);
  await bob
    .delete('/api/tasks/' + taskId)
    .set('Origin', origin)
    .expect(404);
  await alice
    .patch('/api/tasks/' + taskId)
    .set('Origin', origin)
    .send({ owner: '000000000000000000000000' })
    .expect(400);
});
test('pagination is bounded and overview excludes completed overdue tasks', async () => {
  await alice
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ title: 'Second task', project: 'Planning', due: '2026-01-01' })
    .expect(201);
  const page = await alice.get('/api/tasks?limit=1').expect(200);
  assert.equal(page.body.tasks.length, 1);
  assert.equal(page.body.hasMore, true);
  await alice.get('/api/tasks?limit=1000').expect(400);
  await alice.get('/api/tasks?project[$ne]=abc').expect(400);
  const overview = await alice.get('/api/tasks/overview?date=2026-10-09').expect(200);
  assert.equal(overview.body.total, 2);
  assert.equal(overview.body.completed, 1);
  assert.equal(overview.body.overdue, 1);
});
test('expired sessions are denied even before TTL cleanup', async () => {
  await Session.updateMany(
    { user: (await User.findOne({ email: 'bob@example.com' }))._id },
    { expiresAt: new Date(0) },
  );
  await bob.get('/api/auth/me').expect(401);
});
test('delete and logout revoke access', async () => {
  await alice
    .delete('/api/tasks/' + taskId)
    .set('Origin', origin)
    .expect(204);
  await alice.get('/api/tasks/not-an-id').expect(404);
  await alice
    .patch('/api/tasks/not-an-id')
    .set('Origin', origin)
    .send({ status: 'done' })
    .expect(400);
  await alice.post('/api/auth/logout').set('Origin', origin).expect(204);
  await alice.get('/api/tasks').expect(401);
});

test('shared rate store counts requests across instances without storing raw addresses', async () => {
  const first = new MongoRateStore('test');
  const second = new MongoRateStore('test');
  first.init({ windowMs: 60000 });
  second.init({ windowMs: 60000 });
  await first.increment('192.0.2.1');
  assert.equal((await second.increment('192.0.2.1')).totalHits, 2);
  const buckets = await RateBucket.find({ key: /^test:/ }).lean();
  assert.equal(
    buckets.some((bucket) => bucket.key.includes('192.0.2.1')),
    false,
  );
});
test('malformed JSON errors do not echo the request body', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('Content-Type', 'application/json')
    .send('{"password":"do-not-echo-this",')
    .expect(400);
  assert.equal(response.body.message, 'Invalid JSON request body.');
  assert.equal(JSON.stringify(response.body).includes('do-not-echo-this'), false);
});

test('daily planning queries and project summaries remain owner-scoped', async () => {
  const planner = request.agent(app);
  const registration = await planner
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Planner',
      email: 'planner@example.com',
      password: 'planner-long-passphrase',
    })
    .expect(201);
  const owner = registration.body.user.id;
  await Task.insertMany(
    [
      ['Overdue', '2026-10-08', 'todo'],
      ['Today', '2026-10-09', 'todo'],
      ['Tomorrow', '2026-10-10', 'progress'],
      ['Seventh day', '2026-10-16', 'todo'],
      ['Outside week', '2026-10-17', 'todo'],
      ['Already done', '2026-10-09', 'done'],
      ['No date', '', 'todo'],
    ].map(([title, due, status]) => ({ title, due, status, owner, project: 'Review' })),
  );
  const today = await planner.get('/api/tasks?view=today&date=2026-10-09').expect(200);
  assert.deepEqual(
    today.body.tasks.map((task) => task.title),
    ['Overdue', 'Today'],
  );
  const upcoming = await planner
    .get('/api/tasks?view=upcoming&date=2026-10-09')
    .expect(200);
  assert.deepEqual(
    upcoming.body.tasks.map((task) => task.title),
    ['Tomorrow', 'Seventh day'],
  );
  const first = await planner
    .get('/api/tasks?view=today&date=2026-10-09&limit=1')
    .expect(200);
  assert.equal(first.body.hasMore, true);
  await planner.get('/api/tasks?view=today').expect(400);
  const overview = await planner.get('/api/tasks/overview?date=2026-10-09').expect(200);
  assert.equal(overview.body.projectSummaries.length, 1);
  assert.deepEqual(overview.body.projectSummaries[0], {
    name: 'Review',
    unlinked: 7,
    blocked: 0,
    total: 7,
    completed: 1,
    active: 1,
    overdue: 1,
    nextDue: '2026-10-08',
  });
});
test('checklist updates persist without resetting task fields or accepting foreign owners', async () => {
  const planner = request.agent(app);
  await planner
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'planner@example.com', password: 'planner-long-passphrase' })
    .expect(200);
  const checklist = [{ id: 'step-1', text: 'Collect notes', done: false }];
  const result = await planner
    .post('/api/tasks')
    .set('Origin', origin)
    .send({
      title: 'Checklist task',
      project: 'Review',
      priority: 'high',
      description: 'Keep context',
      checklist,
    })
    .expect(201);
  const id = result.body.task.id;
  const updated = await planner
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ checklist: [{ ...checklist[0], done: true }] })
    .expect(200);
  assert.equal(updated.body.task.checklist[0].done, true);
  assert.equal(updated.body.task.description, 'Keep context');
  assert.equal(updated.body.task.priority, 'high');
  await planner
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ checklist: [checklist[0], checklist[0]] })
    .expect(400);
  const stranger = request.agent(app);
  await stranger
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Stranger',
      email: 'stranger@example.com',
      password: 'stranger-long-passphrase',
    })
    .expect(201);
  await stranger
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ checklist: [] })
    .expect(404);
  const overview = await stranger.get('/api/tasks/overview?date=2026-10-09').expect(200);
  assert.deepEqual(overview.body.projectSummaries, []);
});

test('notes and resources persist, remain searchable, and retain owner isolation', async () => {
  const author = request.agent(app);
  await author
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'planner@example.com', password: 'planner-long-passphrase' })
    .expect(200);
  const links = [{ label: 'Design brief', url: 'https://example.com/brief' }];
  const result = await author
    .post('/api/tasks')
    .set('Origin', origin)
    .send({
      title: 'Context task',
      project: 'Context',
      notes: 'Decision keyword-unique',
      links,
    })
    .expect(201);
  const id = result.body.task.id;
  assert.deepEqual(result.body.task.links, links);
  const updated = await author
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ status: 'done' })
    .expect(200);
  assert.equal(updated.body.task.notes, 'Decision keyword-unique');
  assert.deepEqual(updated.body.task.links, links);
  const found = await author.get('/api/tasks?search=keyword-unique').expect(200);
  assert.equal(found.body.tasks[0].id, id);
  const stranger = request.agent(app);
  await stranger
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'stranger@example.com', password: 'stranger-long-passphrase' })
    .expect(200);
  await stranger
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ notes: 'Overwrite' })
    .expect(404);
  await author
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ links: [{ label: 'Unsafe', url: 'javascript:alert(1)' }] })
    .expect(400);
  await author
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ title: 'Too large', project: 'Context', notes: 'x'.repeat(40000) })
    .expect(413);
  await author
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ notes: '', links: [] })
    .expect(200);
  const stored = await Task.findById(id).lean();
  assert.equal(stored.notes, '');
  assert.deepEqual(stored.links, []);
});

test('blockers enforce reasons, remain owner-scoped, and clear on unblocking', async () => {
  const author = request.agent(app);
  await author
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'planner@example.com', password: 'planner-long-passphrase' })
    .expect(200);
  const data = { title: 'Blocked delivery', project: 'Blocker QA', status: 'blocked' };
  await author.post('/api/tasks').set('Origin', origin).send(data).expect(400);
  const created = await author
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ ...data, blockerReason: 'Waiting for design approval' })
    .expect(201);
  const id = created.body.task.id;
  const overview = await author.get('/api/tasks/overview?date=2026-10-09').expect(200);
  assert.equal(overview.body.blocked, 1);
  assert.equal(
    overview.body.projectSummaries.find((project) => project.name === 'Blocker QA')
      .blocked,
    1,
  );
  const blocked = await author.get('/api/tasks?view=blocked').expect(200);
  assert.equal(blocked.body.tasks[0].id, id);
  const updated = await author
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ notes: 'Keep this separate from the reason' })
    .expect(200);
  assert.equal(updated.body.task.blockerReason, 'Waiting for design approval');
  await author
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ blockerReason: '' })
    .expect(400);
  await author
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ status: 'blocked' })
    .expect(400);
  const stranger = request.agent(app);
  await stranger
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'stranger@example.com', password: 'stranger-long-passphrase' })
    .expect(200);
  await stranger
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ status: 'blocked', blockerReason: 'Overwrite' })
    .expect(404);
  assert.deepEqual(
    (await stranger.get('/api/tasks?view=blocked').expect(200)).body.tasks,
    [],
  );
  const resolved = await author
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ status: 'todo' })
    .expect(200);
  assert.equal(resolved.body.task.blockerReason, '');
  assert.equal(
    (await author.get('/api/tasks?view=blocked').expect(200)).body.tasks.length,
    0,
  );
  const owner = await User.findOne({ email: 'planner@example.com' });
  await assert.rejects(Task.create({ ...data, owner: owner._id }), {
    name: 'ValidationError',
  });
});

test('archive, trash, and restoration preserve content and remain owner-scoped', async () => {
  const owner = request.agent(app);
  const outsider = request.agent(app);
  for (const [agent, name] of [
    [owner, 'Recovery Owner'],
    [outsider, 'Recovery Outsider'],
  ]) {
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name,
        email: name.replaceAll(' ', '').toLowerCase() + '@example.com',
        password: 'recovery-test-passphrase',
      })
      .expect(201);
  }
  const created = await owner
    .post('/api/tasks')
    .set('Origin', origin)
    .send({
      title: 'Recoverable task',
      project: 'Recovery',
      notes: 'Keep this decision',
      due: '2026-01-01',
      status: 'blocked',
      blockerReason: 'Waiting for a reply',
      checklist: [{ id: 'keep-step', text: 'Preserve progress', done: true }],
    })
    .expect(201);
  const id = created.body.task.id;
  await owner
    .delete('/api/tasks/' + id + '/permanent')
    .set('Origin', origin)
    .expect(404);
  await outsider
    .patch('/api/tasks/' + id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'archive' })
    .expect(404);
  const archived = await owner
    .patch('/api/tasks/' + id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'archive' })
    .expect(200);
  assert.equal(archived.body.task.lifecycle, 'archived');
  assert.equal((await owner.get('/api/tasks').expect(200)).body.tasks.length, 0);
  assert.equal(
    (await owner.get('/api/tasks?view=blocked').expect(200)).body.tasks.length,
    0,
  );
  const summary = (await owner.get('/api/tasks/overview?date=2026-10-09').expect(200))
    .body;
  assert.equal(summary.total, 0);
  assert.equal(summary.blocked, 0);
  assert.equal(summary.overdue, 0);
  assert.equal(summary.archived, 1);
  assert.deepEqual(summary.projectSummaries, []);
  assert.equal(
    (await outsider.get('/api/tasks?view=archived').expect(200)).body.tasks.length,
    0,
  );
  await owner
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ title: 'Not editable while archived' })
    .expect(404);
  await owner
    .patch('/api/tasks/' + id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'archive' })
    .expect(404);
  await owner
    .patch('/api/tasks/' + id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'unarchive' })
    .expect(200);
  await owner
    .delete('/api/tasks/' + id)
    .set('Origin', origin)
    .expect(204);
  const trash = (await owner.get('/api/tasks?view=trash').expect(200)).body.tasks;
  assert.equal(trash.length, 1);
  assert.equal(trash[0].notes, 'Keep this decision');
  assert.equal(trash[0].checklist[0].done, true);
  assert.equal(
    (await outsider.get('/api/tasks?view=trash').expect(200)).body.tasks.length,
    0,
  );
  await outsider
    .patch('/api/tasks/' + id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'restore' })
    .expect(404);
  await outsider
    .delete('/api/tasks/' + id + '/permanent')
    .set('Origin', origin)
    .expect(404);
  await owner
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ notes: 'Not editable in Trash' })
    .expect(404);
  const restored = await owner
    .patch('/api/tasks/' + id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'restore' })
    .expect(200);
  assert.equal(restored.body.task.status, 'blocked');
  assert.equal(restored.body.task.blockerReason, 'Waiting for a reply');
  await owner
    .patch('/api/tasks/' + id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'archive' })
    .expect(200);
  await owner
    .delete('/api/tasks/' + id)
    .set('Origin', origin)
    .expect(204);
  await owner
    .delete('/api/tasks/' + id + '/permanent')
    .set('Origin', origin)
    .expect(204);
  assert.equal(await Task.countDocuments({ _id: id }), 0);
  await owner
    .patch('/api/tasks/' + id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'restore' })
    .expect(404);
});

test('legacy tasks without lifecycle remain active and competing transitions cannot both win', async () => {
  const owner = request.agent(app);
  const registration = await owner
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Legacy',
      email: 'legacy@example.com',
      password: 'legacy-test-passphrase',
    })
    .expect(201);
  const record = await Task.create({
    owner: registration.body.user.id,
    title: 'Legacy task',
    project: 'Legacy project',
  });
  await Task.collection.updateOne({ _id: record._id }, { $unset: { lifecycle: '' } });
  const listed = (await owner.get('/api/tasks').expect(200)).body.tasks;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].lifecycle, 'active');
  assert.equal(
    (await owner.get('/api/tasks/overview?date=2026-10-09').expect(200)).body.total,
    1,
  );
  const results = await Promise.all(
    [0, 1].map(() =>
      owner
        .patch('/api/tasks/' + record._id + '/lifecycle')
        .set('Origin', origin)
        .send({ action: 'archive' }),
    ),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 404]);
});

test('task exports include all owned lifecycle states, exclude credentials, and limit frequency', async () => {
  await request(app).get('/api/tasks/export').expect(401);
  const owner = request.agent(app);
  const registration = await owner
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Exporter',
      email: 'exporter@example.com',
      password: 'export-test-passphrase',
    })
    .expect(201);
  await Task.insertMany(
    ['active', 'archived', 'trashed'].map((lifecycle) => ({
      owner: registration.body.user.id,
      title: 'Export ' + lifecycle,
      project: 'Export project',
      lifecycle,
      notes: 'Private context',
    })),
  );
  const result = await owner.get('/api/tasks/export').expect(200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.body.scope, 'account');
  assert.equal(result.body.tasks.length, 3);
  assert.deepEqual(result.body.tasks.map((task) => task.lifecycle).sort(), [
    'active',
    'archived',
    'trashed',
  ]);
  assert.ok(
    result.body.tasks.every((task) => !('owner' in task) && !('passwordHash' in task)),
  );
  assert.equal(result.body.user, undefined);
  assert.equal(result.body.session, undefined);
  for (let index = 0; index < 4; index++)
    await owner.get('/api/tasks/export').expect(200);
  const limited = await owner.get('/api/tasks/export').expect(429);
  assert.match(limited.body.message, /Export limit/);
});

test('oversize exports fail explicitly instead of producing a partial backup', async () => {
  const owner = request.agent(app);
  const registration = await owner
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Large Export',
      email: 'largeexport@example.com',
      password: 'export-test-passphrase',
    })
    .expect(201);
  await Task.insertMany(
    Array.from({ length: 1001 }, (_, index) => ({
      owner: registration.body.user.id,
      title: 'Task ' + index,
      project: 'Large export',
    })),
  );
  const result = await owner.get('/api/tasks/export').expect(413);
  assert.match(result.body.message, /1,000 tasks/);
  assert.equal(result.body.tasks, undefined);
});

test('concurrent recurring completions create one next task and retain month-end history', async () => {
  // This independent scenario has its own request budget; production limits remain enabled.
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    outsider = request.agent(app);
  for (const [agent, name] of [
    [owner, 'Repeat Owner'],
    [outsider, 'Repeat Outsider'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name,
        email: name.replaceAll(' ', '').toLowerCase() + '@example.com',
        password: 'repeat-test-passphrase',
      })
      .expect(201);
  const created = await owner
    .post('/api/tasks')
    .set('Origin', origin)
    .send({
      title: 'Monthly review',
      project: 'Repeat',
      due: '2027-01-31',
      recurrence: 'monthly',
      notes: 'Keep the decision',
      checklist: [{ id: 'original-step', text: 'Review the notes', done: true }],
    })
    .expect(201);
  const id = created.body.task.id;
  await outsider
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ status: 'done' })
    .expect(404);
  const results = await Promise.all(
    [0, 1].map(() =>
      owner
        .patch('/api/tasks/' + id)
        .set('Origin', origin)
        .send({ status: 'done' }),
    ),
  );
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(results[0].body.nextTask.id, results[1].body.nextTask.id);
  const nextId = results[0].body.nextTask.id;
  assert.equal(results[0].body.nextTask.due, '2027-02-28');
  assert.equal(results[0].body.nextTask.status, 'todo');
  assert.equal(results[0].body.nextTask.checklist[0].done, false);
  assert.notEqual(results[0].body.nextTask.checklist[0].id, 'original-step');
  assert.equal((await Task.findById(id)).checklist[0].done, true);
  assert.equal(await Task.countDocuments({ repeatSource: id }), 1);
  const edited = await owner
    .patch('/api/tasks/' + nextId)
    .set('Origin', origin)
    .send({ due: '2027-02-28', recurrence: 'monthly', notes: 'Edited context' })
    .expect(200);
  assert.equal(edited.body.task.repeatDay, 31);
  const march = await owner
    .patch('/api/tasks/' + nextId)
    .set('Origin', origin)
    .send({ status: 'done' })
    .expect(200);
  assert.equal(march.body.nextTask.due, '2027-03-31');
  await owner
    .delete('/api/tasks/' + march.body.nextTask.id)
    .set('Origin', origin)
    .expect(204);
  await owner
    .delete('/api/tasks/' + march.body.nextTask.id + '/permanent')
    .set('Origin', origin)
    .expect(204);
  await owner
    .patch('/api/tasks/' + nextId)
    .set('Origin', origin)
    .send({ status: 'done' })
    .expect(200);
  assert.equal(await Task.countDocuments({ repeatSource: nextId }), 0);
  assert.deepEqual((await outsider.get('/api/tasks').expect(200)).body.tasks, []);
});

test('recurrence requires dates and refuses internal successor injection', async () => {
  const owner = request.agent(app);
  await owner
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Repeat Rules',
      email: 'repeatrules@example.com',
      password: 'repeat-test-passphrase',
    })
    .expect(201);
  await owner
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ title: 'Invalid repeat', project: 'Home', recurrence: 'daily' })
    .expect(400);
  const created = await owner
    .post('/api/tasks')
    .set('Origin', origin)
    .send({
      title: 'Daily repeat',
      project: 'Home',
      recurrence: 'daily',
      due: '2027-01-01',
    })
    .expect(201);
  const id = created.body.task.id;
  await owner
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ due: '' })
    .expect(404);
  await owner
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ repeatSource: id })
    .expect(400);
  await owner
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ recurrence: 'weekly' })
    .expect(400);
  const stopped = await owner
    .patch('/api/tasks/' + id)
    .set('Origin', origin)
    .send({ recurrence: 'none', due: '' })
    .expect(200);
  assert.equal(stopped.body.task.recurrence, 'none');
  assert.equal(stopped.body.task.due, '');
});

test('private project creation, updates, and exact labels stay isolated between accounts', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  await request(app).get('/api/projects').expect(401);
  const owner = request.agent(app),
    outsider = request.agent(app);
  for (const [agent, name] of [
    [owner, 'Project Owner'],
    [outsider, 'Project Outsider'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name,
        email: name.replaceAll(' ', '').toLowerCase() + '@example.com',
        password: 'project-test-passphrase',
      })
      .expect(201);
  const data = {
    name: 'Private project',
    description: 'Keep this brief',
    startDate: '2026-10-10',
    targetDate: '2026-10-20',
    status: 'active',
  };
  await owner
    .post('/api/projects')
    .set('Origin', 'https://foreign.example')
    .send(data)
    .expect(403);
  const created = await owner
    .post('/api/projects')
    .set('Origin', origin)
    .send(data)
    .expect(201);
  const id = created.body.project.id;
  assert.equal(created.body.project.owner, undefined);
  assert.equal((await owner.get('/api/projects').expect(200)).body.projects.length, 1);
  assert.deepEqual((await outsider.get('/api/projects').expect(200)).body.projects, []);
  await outsider
    .patch('/api/projects/' + id)
    .set('Origin', origin)
    .send({ description: 'Stolen' })
    .expect(404);
  await owner.post('/api/projects').set('Origin', origin).send(data).expect(409);
  await outsider.post('/api/projects').set('Origin', origin).send(data).expect(201);
  await owner
    .patch('/api/projects/' + id)
    .set('Origin', origin)
    .send({ owner: 'other' })
    .expect(400);
  await owner
    .patch('/api/projects/' + id)
    .set('Origin', origin)
    .send({ name: 'Renamed' })
    .expect(400);
  await owner
    .patch('/api/projects/' + id)
    .set('Origin', origin)
    .send({ startDate: '2026-10-21', targetDate: '2026-10-20' })
    .expect(400);
  const edited = await owner
    .patch('/api/projects/' + id)
    .set('Origin', origin)
    .send({ description: 'Updated brief' })
    .expect(200);
  assert.equal(edited.body.project.name, data.name);
  assert.equal(edited.body.project.status, 'active');
  assert.equal(edited.body.project.targetDate, data.targetDate);
  const counts = (await owner.get('/api/tasks/overview?date=2026-10-09').expect(200))
    .body;
  assert.equal(counts.total, 0);
  await owner
    .patch('/api/projects/not-an-id')
    .set('Origin', origin)
    .send({ status: 'completed' })
    .expect(400);
  assert.equal(await Project.countDocuments({ name: data.name }), 2);
});

test('calendar reads a whole bounded month and attention remains private with combined search', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  await request(app).get('/api/tasks/calendar?month=2026-10').expect(401);
  const owner = request.agent(app),
    outsider = request.agent(app);
  for (const [agent, name] of [
    [owner, 'Calendar Owner'],
    [outsider, 'Calendar Outsider'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name,
        email: name.replaceAll(' ', '') + '@example.com',
        password: 'calendar-test-passphrase',
      })
      .expect(201);
  const user = await User.findOne({ email: 'calendarowner@example.com' });
  const other = await User.findOne({ email: 'calendaroutsider@example.com' });
  const base = {
    owner: user._id,
    title: 'Normal work',
    project: 'Calendar QA',
    priority: 'low',
    status: 'todo',
    due: '2026-10-30',
  };
  await Task.insertMany([
    ...Array.from({ length: 35 }, (_, index) => ({
      ...base,
      title: 'Month task ' + index,
    })),
    {
      ...base,
      title: 'Overdue urgent',
      status: 'blocked',
      blockerReason: 'Need access',
      priority: 'high',
      due: '2026-10-08',
    },
    { ...base, title: 'Due soon', due: '2026-10-12' },
    { ...base, title: 'Completed', status: 'done', due: '2026-10-09' },
    { ...base, title: 'Undated urgent', due: '', priority: 'high' },
    { ...base, title: 'Other month', due: '2026-11-01' },
    { ...base, title: 'Archived urgent', lifecycle: 'archived', priority: 'high' },
    { ...base, title: 'Trashed urgent', lifecycle: 'trashed', priority: 'high' },
    { ...base, owner: other._id, title: 'Private outsider task', priority: 'high' },
  ]);
  const calendar = (await owner.get('/api/tasks/calendar?month=2026-10').expect(200))
    .body;
  assert.equal(calendar.tasks.length, 38);
  assert.equal(calendar.truncated, false);
  assert.ok(calendar.tasks.some((task) => task.title === 'Completed'));
  assert.ok(
    calendar.tasks.every(
      (task) => task.owner === undefined && task.title !== 'Private outsider task',
    ),
  );
  assert.equal(
    (await owner.get('/api/tasks/calendar?month=2026-10&project=Other').expect(200)).body
      .tasks.length,
    0,
  );
  assert.equal(
    (await outsider.get('/api/tasks/calendar?month=2026-10').expect(200)).body.tasks
      .length,
    1,
  );
  for (const query of [
    'month=2026-13',
    'month=1999-12',
    'month[$ne]=',
    'month=2026-10&owner=other',
  ])
    await owner.get('/api/tasks/calendar?' + query).expect(400);
  const attention = (
    await owner.get('/api/tasks?view=attention&date=2026-10-09').expect(200)
  ).body.tasks;
  assert.deepEqual(
    attention.map((task) => task.title).sort(),
    ['Due soon', 'Overdue urgent', 'Undated urgent'].sort(),
  );
  assert.equal(
    (
      await owner
        .get('/api/tasks?view=attention&date=2026-10-09&search=urgent')
        .expect(200)
    ).body.tasks.length,
    2,
  );
  await Task.insertMany(
    Array.from({ length: 1001 }, (_, index) => ({
      ...base,
      project: 'Large calendar',
      title: 'Bounded ' + index,
    })),
  );
  const bounded = (
    await owner
      .get('/api/tasks/calendar?month=2026-10&project=Large%20calendar')
      .expect(200)
  ).body;
  assert.equal(bounded.tasks.length, 1000);
  assert.equal(bounded.truncated, true);
});

test('milestone edits persist privately and omitted milestones are not erased', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    outsider = request.agent(app);
  for (const [agent, name] of [
    [owner, 'Milestone Owner'],
    [outsider, 'Milestone Outsider'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name,
        email: name.replaceAll(' ', '') + '@example.com',
        password: 'milestone-long-passphrase',
      })
      .expect(201);
  const milestone = {
    id: 'launch-checkpoint',
    title: 'Launch release',
    due: '2026-10-30',
    done: false,
  };
  const created = (
    await owner
      .post('/api/projects')
      .set('Origin', origin)
      .send({ name: 'Release milestones', milestones: [milestone] })
      .expect(201)
  ).body.project;
  assert.deepEqual(created.milestones, [milestone]);
  await outsider
    .patch('/api/projects/' + created.id)
    .set('Origin', origin)
    .send({ milestones: [] })
    .expect(404);
  assert.deepEqual((await outsider.get('/api/projects').expect(200)).body.projects, []);
  const edited = (
    await owner
      .patch('/api/projects/' + created.id)
      .set('Origin', origin)
      .send({ milestones: [{ ...milestone, done: true }] })
      .expect(200)
  ).body.project;
  assert.equal(edited.milestones[0].done, true);
  const untouched = (
    await owner
      .patch('/api/projects/' + created.id)
      .set('Origin', origin)
      .send({ description: 'Keep milestones' })
      .expect(200)
  ).body.project;
  assert.equal(untouched.milestones[0].done, true);
  await owner
    .patch('/api/projects/' + created.id)
    .set('Origin', origin)
    .send({ milestones: [milestone, milestone] })
    .expect(400);
  await owner
    .patch('/api/projects/' + created.id)
    .set('Origin', origin)
    .send({ milestones: [{ ...milestone, owner: 'other' }] })
    .expect(400);
});

test('notebook CRUD, filtering and pagination always check the private parent project', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    outsider = request.agent(app);
  for (const [agent, name] of [
    [owner, 'Notebook Owner'],
    [outsider, 'Notebook Outsider'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name,
        email: name.replaceAll(' ', '') + '@example.com',
        password: 'notebook-long-passphrase',
      })
      .expect(201);
  const createProject = async (name) =>
    (await owner.post('/api/projects').set('Origin', origin).send({ name }).expect(201))
      .body.project;
  const project = await createProject('Private notebook'),
    another = await createProject('Other notebook');
  const endpoint = '/api/projects/' + project.id + '/notes';
  await request(app).get(endpoint).expect(401);
  await outsider.get(endpoint).expect(404);
  await owner.get('/api/projects/invalid/notes').expect(400);
  const entry = {
    kind: 'decision',
    title: 'Choose the provider',
    body: '<script>plain text</script>',
    date: '2026-10-09',
  };
  const note = (await owner.post(endpoint).set('Origin', origin).send(entry).expect(201))
    .body.note;
  assert.equal(note.owner, undefined);
  assert.equal(note.project, undefined);
  assert.equal(note.body, entry.body);
  await outsider
    .patch(endpoint + '/' + note.id)
    .set('Origin', origin)
    .send(entry)
    .expect(404);
  await owner
    .patch('/api/projects/' + another.id + '/notes/' + note.id)
    .set('Origin', origin)
    .send(entry)
    .expect(404);
  await owner
    .delete('/api/projects/' + another.id + '/notes/' + note.id)
    .set('Origin', origin)
    .expect(404);
  for (const change of [
    { owner: 'other' },
    { project: another.id },
    { body: ' ' },
    { date: '2026-02-30' },
  ])
    await owner
      .post(endpoint)
      .set('Origin', origin)
      .send({ ...entry, ...change })
      .expect(400);
  const edited = (
    await owner
      .patch(endpoint + '/' + note.id)
      .set('Origin', origin)
      .send({ ...entry, body: 'Reviewed decision' })
      .expect(200)
  ).body.note;
  assert.equal(edited.body, 'Reviewed decision');
  const user = await User.findOne({ email: 'notebookowner@example.com' });
  await ProjectNote.insertMany(
    Array.from({ length: 21 }, (_, index) => ({
      ...entry,
      title: 'Reference ' + index,
      kind: 'note',
      project: project.id,
      owner: user._id,
    })),
  );
  const list = (await owner.get(endpoint).expect(200)).body;
  assert.equal(list.notes.length, 20);
  assert.equal(list.hasMore, true);
  const second = (await owner.get(endpoint + '?page=2').expect(200)).body;
  assert.equal(second.notes.length, 2);
  assert.equal(
    new Set([...list.notes, ...second.notes].map((entry) => entry.id)).size,
    22,
  );
  assert.equal(
    (await owner.get(endpoint + '?kind=decision').expect(200)).body.notes.length,
    1,
  );
  await owner.get(endpoint + '?kind[$ne]=').expect(400);
  await owner
    .patch(endpoint + '/invalid')
    .set('Origin', origin)
    .send(entry)
    .expect(400);
  await owner
    .delete(endpoint + '/' + note.id)
    .set('Origin', 'https://foreign.example')
    .expect(403);
  await owner
    .delete(endpoint + '/' + note.id)
    .set('Origin', origin)
    .expect(204);
  await owner
    .delete(endpoint + '/' + note.id)
    .set('Origin', origin)
    .expect(404);
});

test('weekly work logs persist, filter, bound responses and isolate accounts', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  await request(app).get('/api/work-logs?date=2026-12-29').expect(401);
  const owner = request.agent(app),
    outsider = request.agent(app);
  for (const [agent, name] of [
    [owner, 'Worklog Owner'],
    [outsider, 'Worklog Outsider'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name,
        email: name.replaceAll(' ', '') + '@example.com',
        password: 'worklog-long-passphrase',
      })
      .expect(201);
  const data = {
    activity: 'Research',
    project: 'Launch',
    date: '2026-12-29',
    minutes: 90,
    notes: 'Keep context',
  };
  const log = (
    await owner.post('/api/work-logs').set('Origin', origin).send(data).expect(201)
  ).body.log;
  assert.equal(log.owner, undefined);
  const listed = (await owner.get('/api/work-logs?date=2026-12-29').expect(200)).body;
  assert.deepEqual(listed.range, { start: '2026-12-28', end: '2027-01-03' });
  assert.equal(listed.logs.length, 1);
  assert.deepEqual(
    (await outsider.get('/api/work-logs?date=2026-12-29').expect(200)).body.logs,
    [],
  );
  await outsider
    .patch('/api/work-logs/' + log.id)
    .set('Origin', origin)
    .send(data)
    .expect(404);
  await outsider
    .delete('/api/work-logs/' + log.id)
    .set('Origin', origin)
    .expect(404);
  assert.equal(
    (await owner.get('/api/work-logs?date=2027-01-05').expect(200)).body.logs.length,
    0,
  );
  assert.equal(
    (await owner.get('/api/work-logs?date=2026-12-29&project=Other').expect(200)).body
      .logs.length,
    0,
  );
  const edited = (
    await owner
      .patch('/api/work-logs/' + log.id)
      .set('Origin', origin)
      .send({ ...data, minutes: 120 })
      .expect(200)
  ).body.log;
  assert.equal(edited.minutes, 120);
  for (const change of [
    { minutes: 0 },
    { minutes: 1.5 },
    { minutes: 1441 },
    { owner: 'other' },
  ])
    await owner
      .post('/api/work-logs')
      .set('Origin', origin)
      .send({ ...data, ...change })
      .expect(400);
  await owner.get('/api/work-logs?date=2026-12-29&project[$ne]=').expect(400);
  await owner
    .delete('/api/work-logs/' + log.id)
    .set('Origin', origin)
    .expect(204);
  const user = await User.findOne({ email: 'worklogowner@example.com' });
  await WorkLog.insertMany(
    Array.from({ length: 1001 }, (_, index) => ({
      ...data,
      owner: user._id,
      activity: 'Bounded work ' + index,
    })),
  );
  const bounded = (await owner.get('/api/work-logs?date=2026-12-29').expect(200)).body;
  assert.equal(bounded.logs.length, 1000);
  assert.equal(bounded.truncated, true);
});

test('stable project IDs are server-managed and legacy linking is explicit, private and repeatable', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    outsider = request.agent(app);
  for (const [agent, name] of [
    [owner, 'Reference Owner'],
    [outsider, 'Reference Outsider'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name,
        email: name.replaceAll(' ', '') + '@example.com',
        password: 'reference-long-passphrase',
      })
      .expect(201);
  const data = {
    title: 'First task',
    project: 'Stable project',
    due: '2026-10-09',
    recurrence: 'weekly',
  };
  const first = (
    await owner.post('/api/tasks').set('Origin', origin).send(data).expect(201)
  ).body.task;
  const second = (
    await owner
      .post('/api/tasks')
      .set('Origin', origin)
      .send({ ...data, title: 'Second task' })
      .expect(201)
  ).body.task;
  assert.ok(first.projectId);
  assert.equal(second.projectId, first.projectId);
  const foreign = (
    await outsider.post('/api/tasks').set('Origin', origin).send(data).expect(201)
  ).body.task;
  assert.notEqual(foreign.projectId, first.projectId);
  await owner
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ ...data, projectId: foreign.projectId })
    .expect(400);
  await owner
    .patch('/api/tasks/' + first.id)
    .set('Origin', origin)
    .send({ projectId: foreign.projectId })
    .expect(400);
  const before = await Project.countDocuments({ name: 'Do not create' });
  await outsider
    .patch('/api/tasks/' + first.id)
    .set('Origin', origin)
    .send({ project: 'Do not create' })
    .expect(404);
  assert.equal(await Project.countDocuments({ name: 'Do not create' }), before);
  const completed = (
    await owner
      .patch('/api/tasks/' + first.id)
      .set('Origin', origin)
      .send({ status: 'done' })
      .expect(200)
  ).body;
  assert.equal(completed.nextTask.projectId, first.projectId);
  const user = await User.findOne({ email: 'referenceowner@example.com' });
  const other = await User.findOne({ email: 'referenceoutsider@example.com' });
  const legacy = await Task.insertMany([
    ...['active', 'archived', 'trashed'].map((lifecycle) => ({
      owner: user._id,
      title: 'Legacy ' + lifecycle,
      project: data.project,
      lifecycle,
      status: 'todo',
    })),
    { owner: other._id, title: 'Private legacy', project: data.project, status: 'todo' },
  ]);
  assert.ok(legacy.slice(0, 3).every((task) => !task.projectId));
  const endpoint = '/api/projects/' + first.projectId + '/link-tasks';
  await outsider.patch(endpoint).set('Origin', origin).send({}).expect(404);
  await owner.patch(endpoint).set('Origin', origin).send({ owner: other.id }).expect(400);
  assert.equal(
    (await owner.patch(endpoint).set('Origin', origin).send({}).expect(200)).body.linked,
    3,
  );
  assert.equal(
    (await owner.patch(endpoint).set('Origin', origin).send({}).expect(200)).body.linked,
    0,
  );
  const linked = await Task.find({
    _id: { $in: legacy.slice(0, 3).map((task) => task._id) },
  }).lean();
  assert.ok(linked.every((task) => String(task.projectId) === first.projectId));
  assert.deepEqual(
    linked.map((task) => task.lifecycle).sort(),
    ['active', 'archived', 'trashed'].sort(),
  );
  assert.equal((await Task.findById(legacy[3]._id).lean()).projectId, undefined);
  const moved = (
    await owner
      .patch('/api/tasks/' + second.id)
      .set('Origin', origin)
      .send({ project: 'Another stable project' })
      .expect(200)
  ).body.task;
  assert.notEqual(moved.projectId, first.projectId);
  assert.equal(moved.project, 'Another stable project');
});

test('team invitations, scoped tasks, private notes, and revocation preserve account boundaries', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    member = request.agent(app),
    outsider = request.agent(app);
  const users = [];
  for (const [agent, name] of [
    [owner, 'Team owner'],
    [member, 'Team member'],
    [outsider, 'Team outsider'],
  ]) {
    users.push(
      (
        await agent
          .post('/api/auth/register')
          .set('Origin', origin)
          .send({
            name,
            email: name.replaceAll(' ', '-') + '@example.com',
            password: 'team-test-passphrase-long',
          })
          .expect(201)
      ).body.user,
    );
  }
  const project = (
    await owner
      .post('/api/projects')
      .set('Origin', origin)
      .send({ name: 'Team launch' })
      .expect(201)
  ).body.project;
  const base = '/api/projects/' + project.id;
  const shared = base + '/tasks';
  const task = (
    await owner
      .post('/api/tasks')
      .set('Origin', origin)
      .send({
        title: 'Shared planning',
        project: project.name,
        due: '2026-10-09',
      })
      .expect(201)
  ).body.task;
  const privateTask = (
    await owner
      .post('/api/tasks')
      .set('Origin', origin)
      .send({
        title: 'Private work',
        project: 'Private launch',
      })
      .expect(201)
  ).body.task;
  await request(app).get(shared).expect(401);
  await outsider.get(shared).expect(404);
  await member.get(base + '/members').expect(404);
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: { $ne: null } })
    .expect(400);
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: users[1].email, role: 'owner' })
    .expect(400);
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: users[1].email })
    .expect(201);
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: users[1].email })
    .expect(409);
  const invitation = (await member.get('/api/teams').expect(200)).body.invitations[0];
  assert.equal(invitation.project, project.name);
  await member.get(shared).expect(404);
  await outsider
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(409);
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(204);
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(409);
  const teams = (await member.get('/api/teams').expect(200)).body;
  assert.equal(teams.projects.find((item) => item.id === project.id).role, 'member');
  const directory = (await member.get(base + '/members').expect(200)).body;
  assert.equal(directory.members.length, 1);
  assert.equal(directory.members[0].user.email, undefined);
  assert.equal(directory.owner.passwordHash, undefined);
  const tasks = (await member.get(shared).expect(200)).body.tasks;
  assert.deepEqual(
    tasks.map((item) => item.id),
    [task.id],
  );
  assert.equal((await member.get('/api/tasks').expect(200)).body.tasks.length, 0);
  await member
    .patch('/api/tasks/' + task.id)
    .set('Origin', origin)
    .send({ title: 'Wrong scope' })
    .expect(404);
  await member
    .patch(shared + '/' + privateTask.id)
    .set('Origin', origin)
    .send({ title: 'Leak' })
    .expect(404);
  await member
    .patch(shared + '/' + task.id)
    .set('Origin', origin)
    .send({ project: 'Stolen project' })
    .expect(400);
  await member
    .patch(shared + '/' + task.id)
    .set('Origin', origin)
    .send({ owner: users[1].id })
    .expect(400);
  await member
    .patch(shared + '/' + task.id)
    .set('Origin', origin)
    .send({ status: 'progress' })
    .expect(200);
  const created = (
    await member
      .post(shared)
      .set('Origin', origin)
      .send({ title: 'Member task', project: project.name })
      .expect(201)
  ).body.task;
  assert.equal(String((await Task.findById(created.id)).owner), users[0].id);
  assert.equal(created.projectId, project.id);
  assert.equal(
    (await member.get(shared + '/overview?date=2026-10-09').expect(200)).body.total,
    2,
  );
  assert.equal(
    (await member.get(shared + '/calendar?month=2026-10').expect(200)).body.tasks.length,
    1,
  );
  const exported = (await member.get(shared + '/export').expect(200)).body;
  assert.equal(exported.tasks.length, 2);
  assert.ok(exported.tasks.every((item) => item.title !== 'Private work' && !item.owner));
  await member
    .patch(base)
    .set('Origin', origin)
    .send({ description: 'Take over' })
    .expect(404);
  await member
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: users[2].email })
    .expect(403);
  await member
    .patch(base + '/link-tasks')
    .set('Origin', origin)
    .send({})
    .expect(404);
  await member
    .delete(shared + '/' + created.id)
    .set('Origin', origin)
    .expect(204);
  await member
    .delete(shared + '/' + created.id + '/permanent')
    .set('Origin', origin)
    .expect(403);
  await member
    .patch(shared + '/' + created.id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'restore' })
    .expect(200);
  const noteData = {
    kind: 'note',
    title: 'Private notebook',
    body: 'Never shared',
    date: '2026-10-09',
  };
  const privateNote = (
    await owner
      .post(base + '/notes')
      .set('Origin', origin)
      .send(noteData)
      .expect(201)
  ).body.note;
  assert.equal((await member.get(base + '/team-notes').expect(200)).body.notes.length, 0);
  await member.get(base + '/notes').expect(404);
  const teamNote = (
    await member
      .post(base + '/team-notes')
      .set('Origin', origin)
      .send({ ...noteData, title: 'Shared notebook' })
      .expect(201)
  ).body.note;
  assert.equal((await owner.get(base + '/notes').expect(200)).body.notes.length, 1);
  assert.equal(
    (await owner.get(base + '/team-notes').expect(200)).body.notes[0].canEdit,
    true,
  );
  await member
    .patch(base + '/team-notes/' + privateNote.id)
    .set('Origin', origin)
    .send(noteData)
    .expect(404);
  await member
    .patch(base + '/team-notes/' + teamNote.id)
    .set('Origin', origin)
    .send({ ...noteData, title: 'Edited shared note' })
    .expect(200);
  const ownerNote = (
    await owner
      .post(base + '/team-notes')
      .set('Origin', origin)
      .send(noteData)
      .expect(201)
  ).body.note;
  const visibleNotes = (await member.get(base + '/team-notes').expect(200)).body.notes;
  assert.equal(visibleNotes.find((item) => item.id === ownerNote.id).canEdit, false);
  await member
    .patch(base + '/team-notes/' + ownerNote.id)
    .set('Origin', origin)
    .send(noteData)
    .expect(404);
  await member
    .delete(base + '/team-notes/' + ownerNote.id)
    .set('Origin', origin)
    .expect(404);
  await owner
    .delete(base + '/team-notes/' + teamNote.id)
    .set('Origin', origin)
    .expect(204);
  const collaboration = base + '/collaboration/';
  await member
    .patch(collaboration + task.id + '/assignee')
    .set('Origin', origin)
    .send({ assignee: users[2].id })
    .expect(400);
  await member
    .patch(collaboration + task.id + '/assignee')
    .set('Origin', origin)
    .send({ assignee: { $ne: null } })
    .expect(400);
  await member
    .patch(collaboration + privateTask.id + '/assignee')
    .set('Origin', origin)
    .send({ assignee: users[1].id })
    .expect(404);
  await member
    .patch(collaboration + task.id + '/assignee')
    .set('Origin', origin)
    .send({ assignee: users[1].id })
    .expect(200);
  assert.equal(
    (await member.get(shared).expect(200)).body.tasks.find((item) => item.id === task.id)
      .assignee,
    users[1].id,
  );
  assert.deepEqual(
    (await member.get(shared + '?assigned=me').expect(200)).body.tasks.map(
      (item) => item.id,
    ),
    [task.id],
  );
  await member.get(shared + '?assigned=everyone').expect(400);
  const comments = collaboration + task.id + '/comments';
  await outsider.get(comments).expect(404);
  await member
    .post(comments)
    .set('Origin', origin)
    .send({ body: ' ', author: users[0].id })
    .expect(400);
  await member
    .post(comments)
    .set('Origin', origin)
    .send({ body: '<img src=x onerror=alert(1)> plain text' })
    .expect(201);
  await owner
    .post(comments)
    .set('Origin', origin)
    .send({ body: 'Owner review' })
    .expect(201);
  const discussion = (await member.get(comments).expect(200)).body.comments;
  assert.equal(discussion.length, 2);
  assert.equal(discussion.find((item) => item.body === 'Owner review').canDelete, false);
  assert.ok(discussion.every((item) => !item.author.email));
  await member
    .delete(comments + '/' + discussion.find((item) => item.body === 'Owner review').id)
    .set('Origin', origin)
    .expect(404);
  await member
    .delete(comments + '/' + discussion.find((item) => item.author.id === users[1].id).id)
    .set('Origin', origin)
    .expect(204);
  await owner
    .delete(comments + '/' + discussion.find((item) => item.body === 'Owner review').id)
    .set('Origin', origin)
    .expect(204);
  await member
    .post(comments)
    .set('Origin', origin)
    .send({ body: 'Keep alongside this task' })
    .expect(201);
  await member
    .patch(shared + '/' + task.id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'archive' })
    .expect(200);
  await member
    .post(comments)
    .set('Origin', origin)
    .send({ body: 'Archived write' })
    .expect(409);
  await member
    .patch(collaboration + task.id + '/assignee')
    .set('Origin', origin)
    .send({ assignee: null })
    .expect(409);
  await member
    .patch(shared + '/' + task.id + '/lifecycle')
    .set('Origin', origin)
    .send({ action: 'unarchive' })
    .expect(200);

  const reviewEndpoint = base + '/reviews';
  await member
    .post(reviewEndpoint)
    .set('Origin', origin)
    .send({ task: task.id, reviewer: users[1].id })
    .expect(400);
  await member
    .post(reviewEndpoint)
    .set('Origin', origin)
    .send({ task: task.id, reviewer: users[2].id })
    .expect(400);
  await member
    .post(reviewEndpoint)
    .set('Origin', origin)
    .send({ task: privateTask.id, reviewer: users[0].id })
    .expect(404);
  await member
    .post(reviewEndpoint)
    .set('Origin', origin)
    .send({ task: task.id, reviewer: users[0].id, message: 'Check clarity' })
    .expect(201);
  await member
    .post(reviewEndpoint)
    .set('Origin', origin)
    .send({ task: task.id, reviewer: users[0].id })
    .expect(409);
  const review = (await owner.get(reviewEndpoint).expect(200)).body.reviews[0];
  assert.equal(review.title, task.title);
  assert.equal(review.canDecide, true);
  assert.equal((await owner.get('/api/teams').expect(200)).body.reviewInbox.length, 1);
  assert.equal((await member.get('/api/teams').expect(200)).body.reviewInbox.length, 0);
  assert.equal(
    (await member.get(reviewEndpoint).expect(200)).body.reviews[0].canDecide,
    false,
  );
  await member
    .patch(reviewEndpoint + '/' + review.id)
    .set('Origin', origin)
    .send({ action: 'approve' })
    .expect(409);
  await owner
    .patch(reviewEndpoint + '/' + review.id)
    .set('Origin', origin)
    .send({ action: 'changes', response: ' ' })
    .expect(400);
  await owner
    .patch(reviewEndpoint + '/' + review.id)
    .set('Origin', origin)
    .send({ action: 'changes', response: 'Include acceptance criteria' })
    .expect(204);
  await owner
    .patch(reviewEndpoint + '/' + review.id)
    .set('Origin', origin)
    .send({ action: 'approve' })
    .expect(409);
  assert.equal(
    (await member.get(reviewEndpoint + '?status=changes').expect(200)).body.reviews[0]
      .response,
    'Include acceptance criteria',
  );
  await member
    .post(reviewEndpoint)
    .set('Origin', origin)
    .send({ task: task.id, reviewer: users[0].id })
    .expect(201);
  const pendingReview = (await owner.get(reviewEndpoint + '?status=pending').expect(200))
    .body.reviews[0];
  const membership = directory.members[0].id;
  await outsider
    .delete(base + '/members/' + membership)
    .set('Origin', origin)
    .expect(404);
  await owner
    .delete(base + '/members/' + membership)
    .set('Origin', origin)
    .expect(204);
  await member.get(shared).expect(404);
  await member.get(comments).expect(404);
  await member.get(reviewEndpoint).expect(404);
  await member
    .patch(collaboration + task.id + '/assignee')
    .set('Origin', origin)
    .send({ assignee: null })
    .expect(404);
  await member
    .patch(shared + '/' + task.id)
    .set('Origin', origin)
    .send({ title: 'Stale save' })
    .expect(404);
  await member.get(base + '/team-notes').expect(404);
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(409);
  assert.ok(
    !(await member.get('/api/teams').expect(200)).body.projects.some(
      (item) => item.id === project.id,
    ),
  );
  assert.equal(
    (await owner.get('/api/tasks').expect(200)).body.tasks.find(
      (item) => item.id === task.id,
    ).title,
    task.title,
  );
  await owner
    .patch(reviewEndpoint + '/' + pendingReview.id)
    .set('Origin', origin)
    .send({ action: 'cancel' })
    .expect(204);
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: users[1].email })
    .expect(201);
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'decline' })
    .expect(204);
  await member.get(shared).expect(404);
});

test('project dependencies reject cycles, foreign tasks and concurrent opposing edges', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    outsider = request.agent(app);
  for (const [agent, email] of [
    [owner, 'dependency-owner@example.com'],
    [outsider, 'dependency-outsider@example.com'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Dependency user', email, password: 'dependency-passphrase-long' })
      .expect(201);
  const tasks = [];
  for (const title of ['Research', 'Draft', 'Review'])
    tasks.push(
      (
        await owner
          .post('/api/tasks')
          .set('Origin', origin)
          .send({ title, project: 'Dependency workflow' })
          .expect(201)
      ).body.task,
    );
  const foreign = (
    await owner
      .post('/api/tasks')
      .set('Origin', origin)
      .send({ title: 'Other project', project: 'Elsewhere' })
      .expect(201)
  ).body.task;
  const endpoint = '/api/projects/' + tasks[0].projectId + '/dependencies';
  await outsider.get(endpoint).expect(404);
  await outsider
    .post(endpoint)
    .set('Origin', origin)
    .send({ from: tasks[0].id, to: tasks[1].id })
    .expect(404);
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ from: tasks[0].id, to: tasks[0].id })
    .expect(400);
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ from: tasks[0].id, to: foreign.id })
    .expect(404);
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ from: tasks[0].id, to: tasks[1].id, owner: 'injected' })
    .expect(400);
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ from: tasks[0].id.toUpperCase(), to: tasks[1].id })
    .expect(201);
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ from: tasks[0].id, to: tasks[1].id })
    .expect(409);
  const racing = await Promise.all([
    owner
      .post(endpoint)
      .set('Origin', origin)
      .send({ from: tasks[1].id, to: tasks[2].id }),
    owner
      .post(endpoint)
      .set('Origin', origin)
      .send({ from: tasks[2].id, to: tasks[1].id }),
  ]);
  assert.deepEqual(racing.map((result) => result.status).sort(), [201, 400]);
  const edges = (await owner.get(endpoint).expect(200)).body.edges;
  assert.equal(edges.length, 2);
  assert.equal(edges[0].predecessor.title, 'Research');
  await owner
    .patch('/api/tasks/' + tasks[1].id)
    .set('Origin', origin)
    .send({ project: 'Moved elsewhere' })
    .expect(200);
  const changed = (await owner.get(endpoint).expect(200)).body.edges;
  assert.equal(changed[0].dependent, null);
  assert.ok(
    changed.every(
      (edge) =>
        edge.predecessor?.title !== 'Moved elsewhere' &&
        edge.dependent?.title !== 'Moved elsewhere',
    ),
  );
  await owner
    .delete(endpoint)
    .set('Origin', origin)
    .send({ from: tasks[0].id, to: tasks[1].id })
    .expect(204);
  assert.equal((await owner.get(endpoint).expect(200)).body.edges.length, 1);
});

test('work intake enforces owner triage and repairs acceptance without duplicate tasks', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    member = request.agent(app),
    outsider = request.agent(app);
  const users = [];
  for (const [agent, email] of [
    [owner, 'request-owner@example.com'],
    [member, 'request-member@example.com'],
    [outsider, 'request-outsider@example.com'],
  ])
    users.push(
      (
        await agent
          .post('/api/auth/register')
          .set('Origin', origin)
          .send({ name: 'Request user', email, password: 'request-passphrase-long' })
          .expect(201)
      ).body.user,
    );
  const project = (
    await owner
      .post('/api/projects')
      .set('Origin', origin)
      .send({ name: 'Intake project' })
      .expect(201)
  ).body.project;
  const base = '/api/projects/' + project.id,
    endpoint = base + '/requests';
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: users[1].email })
    .expect(201);
  const invitation = (await member.get('/api/teams').expect(200)).body.invitations[0];
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(204);
  await outsider.get(endpoint).expect(404);
  await member
    .post(endpoint)
    .set('Origin', origin)
    .send({ title: 'Untrusted', requester: users[0].id })
    .expect(400);
  await member
    .post(endpoint)
    .set('Origin', origin)
    .send({
      title: 'Prepare materials',
      description: 'Print the workshop handout',
      priority: 'high',
      due: '2026-10-20',
    })
    .expect(201);
  const pending = (await owner.get(endpoint).expect(200)).body.requests[0];
  assert.equal(pending.canDecide, true);
  assert.equal(
    (await member.get(endpoint).expect(200)).body.requests[0].canDecide,
    false,
  );
  await member
    .patch(endpoint + '/' + pending.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(403);
  const accepted = await Promise.all(
    [1, 2].map(() =>
      owner
        .patch(endpoint + '/' + pending.id)
        .set('Origin', origin)
        .send({ action: 'accept' }),
    ),
  );
  assert.deepEqual(
    accepted.map((result) => result.status),
    [200, 200],
  );
  assert.equal(accepted[0].body.task, accepted[1].body.task);
  assert.equal(
    await Task.countDocuments({ projectId: project.id, title: 'Prepare materials' }),
    1,
  );
  const task = await Task.findById(accepted[0].body.task).lean();
  assert.equal(String(task.owner), users[0].id);
  assert.equal(task.status, 'todo');
  assert.equal(task.priority, 'high');
  await owner
    .patch(endpoint + '/' + pending.id)
    .set('Origin', origin)
    .send({ action: 'decline', response: 'Too late' })
    .expect(409);
  const interrupted = await WorkRequest.create({
    project: project.id,
    requester: users[1].id,
    title: 'Interrupted save',
    status: 'accepting',
  });
  await owner
    .patch(endpoint + '/' + interrupted.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(200);
  assert.equal((await WorkRequest.findById(interrupted._id)).status, 'accepted');
  assert.equal(await Task.countDocuments({ _id: interrupted.task }), 1);
  // A pending request may be cancelled or accepted; competing operations cannot do both.
  const racing = await WorkRequest.create({
    project: project.id,
    requester: users[1].id,
    title: 'Competing decision',
  });
  const results = await Promise.all([
    owner
      .patch(endpoint + '/' + racing.id)
      .set('Origin', origin)
      .send({ action: 'accept' }),
    member
      .patch(endpoint + '/' + racing.id)
      .set('Origin', origin)
      .send({ action: 'cancel' }),
  ]);
  const saved = await WorkRequest.findById(racing._id).lean();
  assert.ok(['accepted', 'cancelled'].includes(saved.status));
  assert.deepEqual(
    results.map((result) => result.status),
    saved.status === 'accepted' ? [200, 409] : [409, 204],
  );
  assert.equal(
    await Task.countDocuments({ _id: racing.task }),
    saved.status === 'accepted' ? 1 : 0,
  );
  await member
    .post(endpoint)
    .set('Origin', origin)
    .send({ title: 'Optional expansion' })
    .expect(201);
  const declined = (await owner.get(endpoint).expect(200)).body.requests.find(
    (item) => item.title === 'Optional expansion',
  );
  await owner
    .patch(endpoint + '/' + declined.id)
    .set('Origin', origin)
    .send({ action: 'decline', response: '' })
    .expect(400);
  await owner
    .patch(endpoint + '/' + declined.id)
    .set('Origin', origin)
    .send({ action: 'decline', response: 'Outside this milestone' })
    .expect(204);
  assert.equal(
    (await member.get(endpoint + '?status=declined').expect(200)).body.requests[0]
      .response,
    'Outside this milestone',
  );
  await owner
    .delete(base + '/members/' + invitation.id)
    .set('Origin', origin)
    .expect(204);
  await member.get(endpoint).expect(404);
});

test('guest portal allowlists project summaries and rejects team reads, mutations and assignment', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    guest = request.agent(app);
  const users = [];
  for (const [agent, email] of [
    [owner, 'portal-owner@example.com'],
    [guest, 'portal-guest@example.com'],
  ])
    users.push(
      (
        await agent
          .post('/api/auth/register')
          .set('Origin', origin)
          .send({ name: 'Portal user', email, password: 'portal-test-passphrase-long' })
          .expect(201)
      ).body.user,
    );
  const task = (
    await owner
      .post('/api/tasks')
      .set('Origin', origin)
      .send({
        title: 'Release [draft]',
        project: 'Client delivery',
        notes: 'Private context',
        links: [{ label: 'Internal', url: 'https://example.com/internal' }],
        description: 'Public delivery brief',
      })
      .expect(201)
  ).body.task;
  const base = '/api/projects/' + task.projectId;
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: users[1].email, role: 'guest' })
    .expect(201);
  await guest.get(base + '/guest').expect(404);
  const invitation = (await guest.get('/api/teams').expect(200)).body.invitations[0];
  assert.equal(invitation.role, 'guest');
  await guest
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(204);
  const portal = (await guest.get(base + '/guest').expect(200)).body;
  assert.equal(portal.total, 1);
  assert.equal(portal.tasks[0].description, 'Public delivery brief');
  assert.equal(portal.tasks[0].notes, undefined);
  assert.equal(portal.tasks[0].links, undefined);
  assert.equal(portal.tasks[0].owner, undefined);
  assert.equal(portal.project.owner, undefined);
  assert.equal(
    (await guest.get(base + '/guest?search=%5Bdraft%5D').expect(200)).body.tasks.length,
    1,
  );
  for (const path of [
    '/tasks',
    '/team-notes',
    '/notes',
    '/members',
    '/reviews',
    '/requests',
    '/dependencies',
    '/collaboration/' + task.id + '/comments',
  ])
    await guest.get(base + path).expect(404);
  await guest
    .patch(base + '/tasks/' + task.id)
    .set('Origin', origin)
    .send({ status: 'done' })
    .expect(404);
  await guest
    .post(base + '/guest')
    .set('Origin', origin)
    .send({})
    .expect(404);
  await owner
    .patch(base + '/collaboration/' + task.id + '/assignee')
    .set('Origin', origin)
    .send({ assignee: users[1].id })
    .expect(400);
  await owner
    .post(base + '/reviews')
    .set('Origin', origin)
    .send({ task: task.id, reviewer: users[1].id })
    .expect(400);
  assert.equal(
    (await guest.get('/api/teams').expect(200)).body.projects[0].role,
    'guest',
  );
  await owner
    .delete(base + '/members/' + invitation.id)
    .set('Origin', origin)
    .expect(204);
  await guest.get(base + '/guest').expect(404);
});

test('workload measures scoped due estimates and enforces per-week capacity permissions', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    member = request.agent(app),
    outsider = request.agent(app);
  const users = [];
  for (const [agent, email] of [
    [owner, 'capacity-owner@example.com'],
    [member, 'capacity-member@example.com'],
    [outsider, 'capacity-other@example.com'],
  ])
    users.push(
      (
        await agent
          .post('/api/auth/register')
          .set('Origin', origin)
          .send({
            name: email.split('@')[0],
            email,
            password: 'capacity-test-passphrase',
          })
          .expect(201)
      ).body.user,
    );
  const task = (
    await owner
      .post('/api/tasks')
      .set('Origin', origin)
      .send({
        title: 'Estimated overdue',
        project: 'Capacity project',
        due: '2026-10-01',
        estimateMinutes: 90,
      })
      .expect(201)
  ).body.task;
  const base = '/api/projects/' + task.projectId;
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: users[1].email })
    .expect(201);
  const invitation = (await member.get('/api/teams').expect(200)).body.invitations[0];
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(204);
  for (const body of [
    { title: 'Missing estimate', due: '2026-10-09' },
    { title: 'Undated', estimateMinutes: 45 },
    { title: 'Future', due: '2026-10-19', estimateMinutes: 120 },
    { title: 'Completed', due: '2026-10-09', status: 'done', estimateMinutes: 60 },
  ])
    await owner
      .post(base + '/tasks')
      .set('Origin', origin)
      .send({ project: 'Capacity project', ...body })
      .expect(201);
  await owner
    .patch(base + '/collaboration/' + task.id + '/assignee')
    .set('Origin', origin)
    .send({ assignee: users[1].id })
    .expect(200);
  const endpoint = base + '/workload';
  await outsider.get(endpoint + '?date=2026-10-10').expect(404);
  await member
    .patch(endpoint + '/capacity')
    .set('Origin', origin)
    .send({ date: '2026-10-10', user: users[0].id, minutes: 120 })
    .expect(403);
  await member
    .patch(endpoint + '/capacity')
    .set('Origin', origin)
    .send({ date: '2026-10-10', user: users[1].id, minutes: 0 })
    .expect(204);
  var report = (await owner.get(endpoint + '?date=2026-10-10').expect(200)).body;
  assert.deepEqual(report.week, { start: '2026-10-05', end: '2026-10-11' });
  const row = report.rows.find((item) => item.id === users[1].id);
  assert.equal(row.minutes, 90);
  assert.equal(row.capacity, 0);
  assert.equal(row.tasks, 1);
  assert.equal(report.unassigned.tasks, 1);
  assert.equal(report.unassigned.unestimated, 1);
  assert.equal(report.unassigned.undated, 1);
  await member
    .patch(endpoint + '/capacity')
    .set('Origin', origin)
    .send({ date: '2026-10-06', user: users[1].id, minutes: null })
    .expect(204);
  assert.equal(
    (await owner.get(endpoint + '?date=2026-10-10').expect(200)).body.rows.find(
      (item) => item.id === users[1].id,
    ).capacity,
    null,
  );
  await owner.get(endpoint + '?date=2026-02-30').expect(400);
  await owner
    .patch(base + '/tasks/' + task.id)
    .set('Origin', origin)
    .send({ estimateMinutes: -1 })
    .expect(400);
  assert.equal(
    (await owner.get('/api/tasks/export').expect(200)).body.tasks.find(
      (item) => item.id === task.id,
    ).estimateMinutes,
    90,
  );
  await owner
    .delete(base + '/members/' + invitation.id)
    .set('Origin', origin)
    .expect(204);
  await member.get(endpoint + '?date=2026-10-10').expect(404);
  report = (await owner.get(endpoint + '?date=2026-10-10').expect(200)).body;
  assert.equal(report.otherAssignments.minutes, 90);
});

test('project objectives enforce authorship, bounded results and stale update protection', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    member = request.agent(app);
  for (const [agent, email] of [
    [owner, 'goal-owner@example.com'],
    [member, 'goal-member@example.com'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Goal user', email, password: 'goal-test-passphrase-long' })
      .expect(201);
  const project = (
    await owner
      .post('/api/projects')
      .set('Origin', origin)
      .send({ name: 'Goal project' })
      .expect(201)
  ).body.project;
  const base = '/api/projects/' + project.id,
    endpoint = base + '/goals';
  const data = {
    title: 'Validate the workshop',
    results: [
      {
        id: 'interviews',
        title: 'Interview 10 participants',
        unit: 'people',
        baseline: 0,
        current: 3,
        target: 10,
      },
    ],
  };
  const goal = (await owner.post(endpoint).set('Origin', origin).send(data).expect(201))
    .body.goal;
  assert.equal(goal.progress, 30);
  await member.get(endpoint).expect(404);
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: 'goal-member@example.com' })
    .expect(201);
  const invitation = (await member.get('/api/teams').expect(200)).body.invitations[0];
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(204);
  assert.equal((await member.get(endpoint).expect(200)).body.goals[0].canEdit, false);
  await member
    .patch(endpoint + '/' + goal.id)
    .set('Origin', origin)
    .send({ ...data, revision: 0 })
    .expect(404);
  const memberGoal = (
    await member
      .post(endpoint)
      .set('Origin', origin)
      .send({
        ...data,
        title: 'Reduce waiting',
        results: [
          {
            id: 'wait',
            title: 'Reduce wait time',
            baseline: 20,
            current: 15,
            target: 10,
          },
        ],
      })
      .expect(201)
  ).body.goal;
  assert.equal(memberGoal.progress, 50);
  const results = await Promise.all(
    [1, 2].map((current) =>
      owner
        .patch(endpoint + '/' + goal.id)
        .set('Origin', origin)
        .send({ ...data, results: [{ ...data.results[0], current }], revision: 0 }),
    ),
  );
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
  await owner
    .delete(endpoint + '/' + goal.id)
    .set('Origin', origin)
    .send({ revision: 0 })
    .expect(409);
  await owner
    .delete(endpoint + '/' + memberGoal.id)
    .set('Origin', origin)
    .send({ revision: 0 })
    .expect(204);
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ ...data, results: [...data.results, ...data.results] })
    .expect(400);
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ ...data, createdBy: 'spoof' })
    .expect(400);
  await owner
    .delete(base + '/members/' + invitation.id)
    .set('Origin', origin)
    .expect(204);
  await member.get(endpoint).expect(404);
});

test('project templates are owner-only, concurrency-safe and repair partial setup without overwrites', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    member = request.agent(app);
  for (const [agent, email] of [
    [owner, 'template-owner@example.com'],
    [member, 'template-member@example.com'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Template user', email, password: 'template-test-passphrase' })
      .expect(201);
  const project = (
    await owner
      .post('/api/projects')
      .set('Origin', origin)
      .send({ name: 'Template project' })
      .expect(201)
  ).body.project;
  const base = '/api/projects/' + project.id,
    endpoint = base + '/workflow/template';
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: 'template-member@example.com' })
    .expect(201);
  const invitation = (await member.get('/api/teams').expect(200)).body.invitations[0];
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(204);
  await member
    .post(endpoint)
    .set('Origin', origin)
    .send({ templateId: 'research-v1' })
    .expect(403);
  const responses = await Promise.all(
    [1, 2].map(() =>
      owner.post(endpoint).set('Origin', origin).send({ templateId: 'research-v1' }),
    ),
  );
  assert.ok(responses.every((result) => result.status === 200));
  assert.equal(await Task.countDocuments({ projectId: project.id }), 3);
  const tasks = await Task.find({ projectId: project.id }).lean();
  await Task.updateOne(
    { _id: tasks[0]._id },
    { $set: { title: 'Customized research step' } },
  );
  await Project.updateOne({ _id: project.id }, { $set: { templateReady: false } });
  await Task.deleteOne({ _id: tasks[1]._id });
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ templateId: 'research-v1' })
    .expect(200);
  assert.equal(await Task.countDocuments({ projectId: project.id }), 3);
  assert.equal(
    (await Task.findById(tasks[0]._id).lean()).title,
    'Customized research step',
  );
  await Task.deleteOne({ _id: tasks[1]._id });
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ templateId: 'research-v1' })
    .expect(200);
  assert.equal(await Task.countDocuments({ projectId: project.id }), 2);
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ templateId: 'launch-v1' })
    .expect(409);
  await owner
    .post(endpoint)
    .set('Origin', origin)
    .send({ templateId: 'invented' })
    .expect(400);
});

test('task backup import validates preview and retries a private restore without recreating deleted tasks', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const agent = request.agent(app);
  await agent
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      name: 'Importer',
      email: 'importer@example.com',
      password: 'import-test-passphrase-long',
    })
    .expect(201);
  await agent
    .post('/api/tasks')
    .set('Origin', origin)
    .send({
      title: 'Original task',
      project: 'Original project',
      notes: 'A safe backup note',
      estimateMinutes: 30,
      due: '2026-10-10',
      recurrence: 'weekly',
      checklist: [{ id: 'old-step', text: 'Keep this context', done: true }],
    })
    .expect(201);
  const file = (await agent.get('/api/tasks/export').expect(200)).body;
  const originalId = file.tasks[0].id;
  assert.equal(
    (
      await agent
        .post('/api/imports/preview')
        .set('Origin', origin)
        .send({ file })
        .expect(200)
    ).body.count,
    1,
  );
  await agent
    .post('/api/imports/preview')
    .set('Origin', origin)
    .send({ file: { ...file, tasks: [{ ...file.tasks[0], owner: 'spoofed' }] } })
    .expect(400);
  const key = '74f62c47-d8b6-441d-bdb0-e1a3caed1111',
    body = { key, file, projectName: 'Restored backup' };
  const responses = await Promise.all(
    [1, 2].map(() => agent.post('/api/imports').set('Origin', origin).send(body)),
  );
  assert.ok(responses.every((response) => response.status === 200));
  const projectId = responses[0].body.projectId,
    tasks = (await agent.get('/api/projects/' + projectId + '/tasks').expect(200)).body
      .tasks;
  assert.equal(tasks.length, 1);
  assert.notEqual(tasks[0].id, originalId);
  assert.equal(tasks[0].notes, 'A safe backup note');
  assert.equal(tasks[0].estimateMinutes, 30);
  assert.equal(tasks[0].recurrence, 'none');
  assert.notEqual(tasks[0].checklist[0].id, 'old-step');
  await Task.deleteOne({ _id: tasks[0].id });
  const retry = (
    await agent.post('/api/imports').set('Origin', origin).send(body).expect(200)
  ).body;
  assert.equal(retry.count, 1);
  assert.equal(await Task.countDocuments({ projectId }), 0);
  await agent
    .post('/api/imports')
    .set('Origin', origin)
    .send({ ...body, projectName: 'Changed retry' })
    .expect(409);
  await agent
    .post('/api/imports')
    .set('Origin', origin)
    .send({
      ...body,
      key: '74f62c47-d8b6-441d-bdb0-e1a3caed2222',
      projectName: 'Original project',
    })
    .expect(409);
  await agent
    .post('/api/imports/preview')
    .set('Origin', origin)
    .send({ file: { ...file, tasks: Array(101).fill(file.tasks[0]) } })
    .expect(400);
});

test('recovery codes are password-gated, one-use and revoke all earlier session versions', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const first = request.agent(app),
    second = request.agent(app),
    password = 'security-old-passphrase-long',
    newPassword = 'security-new-passphrase-long';
  await first
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({ name: 'Security user', email: 'security@example.com', password })
    .expect(201);
  await second
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'security@example.com', password })
    .expect(200);
  await first
    .post('/api/auth/recovery-code')
    .set('Origin', origin)
    .send({ password: 'wrong' })
    .expect(401);
  const code = (
    await first
      .post('/api/auth/recovery-code')
      .set('Origin', origin)
      .send({ password })
      .expect(200)
  ).body.code;
  assert.match(code, /^[a-f0-9]{64}$/);
  const saved = await User.findOne({ email: 'security@example.com' })
    .select('+recoveryHash')
    .lean();
  assert.notEqual(saved.recoveryHash, code);
  const recover = { email: 'security@example.com', code, password: newPassword };
  const results = await Promise.all(
    [1, 2].map(() =>
      request(app).post('/api/auth/recover').set('Origin', origin).send(recover),
    ),
  );
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 400]);
  await first.get('/api/auth/me').expect(401);
  await second.get('/api/auth/me').expect(401);
  await first
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'security@example.com', password })
    .expect(401);
  await first
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'security@example.com', password: newPassword })
    .expect(200);
  await second
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: 'security@example.com', password: newPassword })
    .expect(200);
  const nextCode = (
    await first
      .post('/api/auth/recovery-code')
      .set('Origin', origin)
      .send({ password: newPassword })
      .expect(200)
  ).body.code;
  await first
    .post('/api/auth/password')
    .set('Origin', origin)
    .send({ password: newPassword, newPassword: 'security-final-passphrase-long' })
    .expect(200);
  await first.get('/api/auth/me').expect(200);
  await second.get('/api/auth/me').expect(401);
  await request(app)
    .post('/api/auth/recover')
    .set('Origin', origin)
    .send({ ...recover, code: nextCode })
    .expect(400);
  const publicResponse = (await first.get('/api/auth/me').expect(200)).body.user;
  assert.equal(publicResponse.recoveryHash, undefined);
  assert.equal(publicResponse.passwordHash, undefined);
  assert.equal(publicResponse.authVersion, undefined);
});

test('account deletion freezes access, resumes in batches and cascades only the requested owner', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    member = request.agent(app),
    password = 'delete-test-passphrase-long';
  const users = [];
  for (const [agent, email] of [
    [owner, 'delete-owner@example.com'],
    [member, 'delete-member@example.com'],
  ])
    users.push(
      (
        await agent
          .post('/api/auth/register')
          .set('Origin', origin)
          .send({ name: 'Deletion user', email, password })
          .expect(201)
      ).body.user,
    );
  const ownedProjects = [];
  for (let index = 0; index < 6; index++)
    ownedProjects.push(
      (
        await owner
          .post('/api/projects')
          .set('Origin', origin)
          .send({ name: 'Deletion project ' + index })
          .expect(201)
      ).body.project,
    );
  const base = '/api/projects/' + ownedProjects[5].id;
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: users[1].email })
    .expect(201);
  const invitation = (await member.get('/api/teams').expect(200)).body.invitations[0];
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(204);
  await owner
    .post(base + '/tasks')
    .set('Origin', origin)
    .send({ title: 'Owner task', project: ownedProjects[5].name })
    .expect(201);
  await member
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ title: 'Keep member task', project: 'Member project' })
    .expect(201);
  await owner
    .delete('/api/account')
    .set('Origin', origin)
    .send({ password, confirmation: 'no' })
    .expect(400);
  await owner
    .delete('/api/account')
    .set('Origin', origin)
    .send({ password: 'wrong', confirmation: 'DELETE' })
    .expect(401);
  await owner
    .delete('/api/account')
    .set('Origin', origin)
    .send({ password, confirmation: 'DELETE' })
    .expect(202);
  assert.equal((await owner.get('/api/auth/me').expect(200)).body.user.deleting, true);
  await owner
    .post('/api/tasks')
    .set('Origin', origin)
    .send({ title: 'Cannot create', project: 'Frozen' })
    .expect(403);
  await member.get(base + '/tasks').expect(404);
  await owner
    .delete('/api/account')
    .set('Origin', origin)
    .send({ password, confirmation: 'DELETE' })
    .expect(204);
  await owner.get('/api/auth/me').expect(401);
  assert.equal(await Project.countDocuments({ owner: users[0].id }), 0);
  assert.equal(await Task.countDocuments({ owner: users[0].id }), 0);
  assert.equal(await Session.countDocuments({ user: users[0].id }), 0);
  assert.equal(
    await ProjectMember.countDocuments({
      project: { $in: ownedProjects.map((item) => item.id) },
    }),
    0,
  );
  assert.equal(
    (await member.get('/api/tasks').expect(200)).body.tasks[0].title,
    'Keep member task',
  );
  await request(app).get('/api/maintenance').expect(401);
  process.env.CRON_SECRET = 'test-only-maintenance-secret-at-least-32-characters';
  await request(app)
    .get('/api/maintenance')
    .set('Authorization', 'Bearer wrong')
    .expect(401);
  await Task.create({
    owner: users[0].id,
    project: 'Late orphan',
    title: 'Late in-flight write',
  });
  const { AccountDeletion } = await import('../server/models/AccountDeletion.js');
  await AccountDeletion.updateOne(
    { user: users[0].id },
    { $set: { lastSweptAt: new Date(0) } },
  );
  await request(app)
    .get('/api/maintenance')
    .set('Authorization', 'Bearer ' + process.env.CRON_SECRET)
    .expect(200);
  assert.equal(await Task.countDocuments({ owner: users[0].id }), 0);
  delete process.env.CRON_SECRET;
});

test('opt-in project rules complete checked work safely and only elevate unfinished overdue tasks', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    member = request.agent(app);
  for (const [agent, email] of [
    [owner, 'rule-owner@example.com'],
    [member, 'rule-member@example.com'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Rule user', email, password: 'rule-test-passphrase-long' })
      .expect(201);
  const task = (
    await owner
      .post('/api/tasks')
      .set('Origin', origin)
      .send({
        title: 'Checked task',
        project: 'Rule project',
        due: '2000-01-01',
        recurrence: 'weekly',
        checklist: [{ id: 'one', text: 'Finish step', done: false }],
      })
      .expect(201)
  ).body.task;
  const base = '/api/projects/' + task.projectId,
    endpoint = base + '/workflow/automation';
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: 'rule-member@example.com' })
    .expect(201);
  const invitation = (await member.get('/api/teams').expect(200)).body.invitations[0];
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(204);
  await member
    .patch(endpoint)
    .set('Origin', origin)
    .send({ checklistToDone: true, overdueHigh: true, revision: 0 })
    .expect(403);
  await owner
    .patch(endpoint)
    .set('Origin', origin)
    .send({ checklistToDone: true, overdueHigh: true, revision: 0 })
    .expect(204);
  await owner
    .patch(endpoint)
    .set('Origin', origin)
    .send({ checklistToDone: false, overdueHigh: false, revision: 0 })
    .expect(409);
  const completed = (
    await member
      .patch(base + '/tasks/' + task.id)
      .set('Origin', origin)
      .send({ checklist: [{ id: 'one', text: 'Finish step', done: true }] })
      .expect(200)
  ).body;
  assert.equal(completed.task.status, 'done');
  assert.ok(completed.nextTask);
  const blocked = (
    await owner
      .post(base + '/tasks')
      .set('Origin', origin)
      .send({
        title: 'Still blocked',
        project: 'Rule project',
        status: 'blocked',
        blockerReason: 'Waiting for permission',
        due: '2000-01-01',
        priority: 'low',
      })
      .expect(201)
  ).body.task;
  assert.equal(
    (
      await owner
        .patch(base + '/tasks/' + blocked.id)
        .set('Origin', origin)
        .send({ checklist: [{ id: 'done', text: 'Prepared', done: true }] })
        .expect(200)
    ).body.task.status,
    'blocked',
  );
  const undated = (
    await owner
      .post(base + '/tasks')
      .set('Origin', origin)
      .send({ title: 'Undated task', project: 'Rule project', priority: 'low' })
      .expect(201)
  ).body.task;
  assert.equal(
    (
      await owner
        .patch(base + '/tasks/' + undated.id)
        .set('Origin', origin)
        .send({ checklist: [] })
        .expect(200)
    ).body.task.status,
    'todo',
  );
  const result = (
    await owner
      .post(endpoint + '/run')
      .set('Origin', origin)
      .send({})
      .expect(200)
  ).body;
  assert.equal(result.changed, 2);
  assert.equal((await Task.findById(task.id).lean()).priority, 'medium');
  assert.equal((await Task.findById(blocked.id).lean()).priority, 'high');
  assert.equal((await Task.findById(undated.id).lean()).priority, 'low');
  assert.equal(
    (
      await owner
        .post(endpoint + '/run')
        .set('Origin', origin)
        .send({})
        .expect(200)
    ).body.changed,
    0,
  );
});

test('calendar downloads are owner-scoped and include active unfinished deadlines only', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    other = request.agent(app);
  for (const [agent, email] of [
    [owner, 'ics-owner@example.com'],
    [other, 'ics-other@example.com'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Calendar user', email, password: 'calendar-test-passphrase' })
      .expect(201);
  for (const body of [
    { title: 'Owned deadline', due: '2026-10-11' },
    { title: 'Completed deadline', due: '2026-10-11', status: 'done' },
    { title: 'Undated task' },
  ])
    await owner
      .post('/api/tasks')
      .set('Origin', origin)
      .send({ project: 'Calendar project', notes: 'Exclude this private note', ...body })
      .expect(201);
  const exported = (await owner.get('/api/tasks/calendar-export').expect(200)).body;
  assert.equal(exported.count, 1);
  assert.ok(exported.calendar.includes('Owned deadline'));
  assert.ok(!exported.calendar.includes('Completed deadline'));
  assert.ok(!exported.calendar.includes('Exclude this private note'));
  assert.equal((await other.get('/api/tasks/calendar-export').expect(200)).body.count, 0);
});

test('schedule proposals preserve concurrent edits, scoped dates and retry-safe batch state', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const owner = request.agent(app),
    member = request.agent(app);
  for (const [agent, email] of [
    [owner, 'schedule-owner@example.com'],
    [member, 'schedule-member@example.com'],
  ])
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'Schedule user', email, password: 'schedule-test-passphrase' })
      .expect(201);
  const first = (
    await owner
      .post('/api/tasks')
      .set('Origin', origin)
      .send({ title: 'Prepare', project: 'Scheduled project', durationDays: 2 })
      .expect(201)
  ).body.task;
  const base = '/api/projects/' + first.projectId,
    endpoint = base + '/schedule';
  const second = (
    await owner
      .post(base + '/tasks')
      .set('Origin', origin)
      .send({ title: 'Deliver', project: 'Scheduled project', durationDays: 1 })
      .expect(201)
  ).body.task;
  await owner
    .post(base + '/dependencies')
    .set('Origin', origin)
    .send({ from: first.id, to: second.id })
    .expect(201);
  await owner
    .post(base + '/members')
    .set('Origin', origin)
    .send({ email: 'schedule-member@example.com' })
    .expect(201);
  const invitation = (await member.get('/api/teams').expect(200)).body.invitations[0];
  await member
    .patch('/api/teams/invitations/' + invitation.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(204);
  await member
    .post(endpoint + '/preview')
    .set('Origin', origin)
    .send({ startDate: '2026-10-10' })
    .expect(403);
  const plan = (
    await owner
      .post(endpoint + '/preview')
      .set('Origin', origin)
      .send({ startDate: '2026-10-10' })
      .expect(201)
  ).body.plan;
  assert.equal(plan.rows.find((row) => row.id === second.id).newDue, '2026-10-12');
  await owner
    .patch(base + '/tasks/' + first.id)
    .set('Origin', origin)
    .send({ due: '2026-11-01' })
    .expect(200);
  const applied = (
    await owner
      .post(endpoint + '/' + plan.id + '/apply')
      .set('Origin', origin)
      .send({})
      .expect(200)
  ).body.plan;
  assert.equal(applied.conflicts, 1);
  assert.equal(applied.pending, 0);
  assert.equal((await Task.findById(first.id).lean()).due, '2026-11-01');
  assert.equal((await Task.findById(second.id).lean()).due, '2026-10-12');
  await owner
    .post(endpoint + '/' + plan.id + '/apply')
    .set('Origin', origin)
    .send({})
    .expect(200);
  assert.equal((await Task.findById(first.id).lean()).due, '2026-11-01');
  const next = (
    await owner
      .post(endpoint + '/preview')
      .set('Origin', origin)
      .send({ startDate: '2026-10-10' })
      .expect(201)
  ).body.plan;
  await owner
    .delete(base + '/dependencies')
    .set('Origin', origin)
    .send({ from: first.id, to: second.id })
    .expect(204);
  await owner
    .post(endpoint + '/' + next.id + '/apply')
    .set('Origin', origin)
    .send({})
    .expect(409);
  await owner
    .post(endpoint + '/preview')
    .set('Origin', origin)
    .send({ startDate: '2026-02-30' })
    .expect(400);
});

test('large schedules resume 25-row batches and safely repair an interrupted saved-row marker', async () => {
  await RateBucket.deleteMany({ key: /^(api|auth):/ });
  const agent = request.agent(app);
  const user = (
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name: 'Batch planner',
        email: 'batch-planner@example.com',
        password: 'batch-planner-passphrase-long',
      })
      .expect(201)
  ).body.user;
  const project = (
    await agent
      .post('/api/projects')
      .set('Origin', origin)
      .send({ name: 'Batch schedule' })
      .expect(201)
  ).body.project;
  await Task.insertMany(
    Array.from({ length: 28 }, (_, index) => ({
      owner: user.id,
      projectId: project.id,
      project: project.name,
      title: 'Plan step ' + index,
    })),
  );
  const endpoint = '/api/projects/' + project.id + '/schedule';
  const plan = (
    await agent
      .post(endpoint + '/preview')
      .set('Origin', origin)
      .send({ startDate: '2026-10-10' })
      .expect(201)
  ).body.plan;
  const first = (
    await agent
      .post(endpoint + '/' + plan.id + '/apply')
      .set('Origin', origin)
      .send({})
      .expect(200)
  ).body.plan;
  assert.equal(first.pending, 3);
  assert.equal(first.rows.filter((row) => row.state === 'saved').length, 25);
  const { ProjectSchedule } = await import('../server/models/ProjectSchedule.js');
  await ProjectSchedule.updateOne(
    { _id: plan.id },
    { $set: { 'rows.0.state': 'pending' } },
  );
  const second = (
    await agent
      .post(endpoint + '/' + plan.id + '/apply')
      .set('Origin', origin)
      .send({})
      .expect(200)
  ).body.plan;
  assert.equal(second.pending, 0);
  assert.equal(second.conflicts, 0);
  assert.equal(
    await Task.countDocuments({ projectId: project.id, due: '2026-10-10' }),
    28,
  );
  await ProjectSchedule.updateOne({ _id: plan.id }, { $set: { expiresAt: new Date(0) } });
  await agent
    .post(endpoint + '/' + plan.id + '/apply')
    .set('Origin', origin)
    .send({})
    .expect(409);
});

test('portfolio and digest honor membership, guest roles, assignments and closed owners', async () => {
  await RateBucket.deleteMany({});
  const ownerAgent = request.agent(app),
    memberAgent = request.agent(app);
  const register = async (agent, name) =>
    (
      await agent
        .post('/api/auth/register')
        .set('Origin', origin)
        .send({
          name,
          email: name + '@portfolio.example',
          password: 'portfolio-long-passphrase',
        })
        .expect(201)
    ).body.user;
  const owner = await register(ownerAgent, 'PortfolioOwner');
  const member = await register(memberAgent, 'PortfolioMember');
  const project = await Project.create({
    owner: owner.id,
    name: 'Shared report',
    targetDate: '2026-10-01',
    status: 'active',
  });
  const empty = await Project.create({
    owner: member.id,
    name: 'Empty personal project',
  });
  const guestProject = await Project.create({
    owner: owner.id,
    name: 'Guest-only report',
  });
  const invitedProject = await Project.create({
    owner: owner.id,
    name: 'Pending invitation report',
  });
  const membership = await ProjectMember.create({
    project: project._id,
    user: member.id,
    status: 'active',
  });
  await ProjectMember.create({
    project: guestProject._id,
    user: member.id,
    status: 'active',
    role: 'guest',
  });
  await ProjectMember.create({ project: invitedProject._id, user: member.id });
  const assigned = await Task.create({
    owner: owner.id,
    projectId: project._id,
    project: project.name,
    title: 'Assigned urgent work',
    assignee: member.id,
    priority: 'high',
    due: '2026-10-09',
    notes: 'Never in digest',
  });
  await Task.create({
    owner: owner.id,
    projectId: project._id,
    project: project.name,
    title: 'Unassigned urgent work',
    priority: 'high',
  });
  await Task.create({
    owner: owner.id,
    projectId: guestProject._id,
    project: guestProject.name,
    title: 'Guest urgent work',
    assignee: member.id,
    priority: 'high',
  });
  await Task.create({
    owner: member.id,
    project: 'Private label',
    title: 'Private urgent work',
    due: '2026-10-10',
  });
  await Task.create({
    owner: member.id,
    projectId: empty._id,
    project: empty.name,
    title: 'Archived private work',
    lifecycle: 'archived',
    priority: 'high',
  });
  await TaskReview.create({
    project: project._id,
    task: assigned._id,
    requester: owner.id,
    reviewer: member.id,
    title: assigned.title,
    description: 'Private review snapshot',
  });
  await WorkRequest.create({
    project: project._id,
    requester: member.id,
    title: 'Intake decision',
  });
  const endpoint = '/api/teams/portfolio?date=2026-10-10';
  await request(app).get(endpoint).expect(401);
  await memberAgent.get('/api/teams/portfolio?date[$ne]=x').expect(400);
  await memberAgent.get('/api/teams/portfolio?date=2026-02-30').expect(400);
  const report = (await memberAgent.get(endpoint).expect(200)).body;
  assert.equal(report.projects.length, 2);
  const shared = report.projects.find((item) => item.id === String(project._id));
  assert.equal(shared.total, 2);
  assert.equal(shared.overdue, 1);
  assert.equal(shared.nextDue, '2026-10-09');
  assert.equal(shared.role, 'member');
  assert.ok(shared.health.reasons.includes('Project target date has passed'));
  assert.equal(report.projects.find((item) => item.id === String(empty._id)).total, 0);
  assert.deepEqual(
    new Set(report.digest.tasks.map((item) => item.title)),
    new Set(['Assigned urgent work', 'Private urgent work']),
  );
  assert.equal(
    report.digest.tasks.find((item) => item.title === assigned.title).shared,
    true,
  );
  assert.equal(report.digest.reviews.length, 1);
  assert.equal(report.digest.requests.length, 0);
  assert.equal(report.digest.invitations.length, 1);
  assert.ok(!JSON.stringify(report).includes('Never in digest'));
  assert.ok(!JSON.stringify(report).includes('Private review snapshot'));
  const ownerReport = (await ownerAgent.get(endpoint).expect(200)).body;
  assert.equal(ownerReport.digest.requests.length, 1);
  await ProjectMember.updateOne({ _id: membership._id }, { $set: { status: 'revoked' } });
  const revoked = (await memberAgent.get(endpoint).expect(200)).body;
  assert.equal(revoked.projects.length, 1);
  assert.equal(revoked.digest.reviews.length, 0);
  assert.ok(!revoked.digest.tasks.some((item) => item.shared));
  await ProjectMember.updateOne({ _id: membership._id }, { $set: { status: 'active' } });
  await User.updateOne({ _id: owner.id }, { $set: { deleting: true } });
  const closed = (await memberAgent.get(endpoint).expect(200)).body;
  assert.equal(closed.projects.length, 1);
  assert.equal(closed.digest.invitations.length, 0);
  assert.equal(closed.digest.tasks.length, 1);
  const closedTeams = (await memberAgent.get('/api/teams').expect(200)).body;
  assert.ok(
    !closedTeams.projects.some(
      (item) => item.name === 'Shared report' || item.name === 'Guest-only report',
    ),
  );
  assert.equal(closedTeams.invitations.length, 0);
  assert.equal(closedTeams.reviewInbox.length, 0);
});

test('digest groups and portfolio scope report their truncation without leaking unbounded records', async () => {
  await RateBucket.deleteMany({});
  const agent = request.agent(app);
  const user = (
    await agent
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({
        name: 'Report bounds',
        email: 'bounds@portfolio.example',
        password: 'portfolio-long-passphrase',
      })
      .expect(201)
  ).body.user;
  await Project.insertMany(
    Array.from({ length: 101 }, (_, index) => ({
      owner: user.id,
      name: 'Bound ' + index,
    })),
  );
  await Task.insertMany(
    Array.from({ length: 31 }, (_, index) => ({
      owner: user.id,
      project: 'Private group',
      title: 'Urgent ' + index,
      priority: 'high',
    })),
  );
  const report = (await agent.get('/api/teams/portfolio?date=2026-10-10').expect(200))
    .body;
  assert.equal(report.projects.length, 100);
  assert.equal(report.truncated, true);
  assert.equal(report.digest.tasks.length, 30);
  assert.equal(report.digest.truncated, true);
});

test('public intake reveals only a name, supports safe retries and owner triage, and revokes links', async () => {
  await RateBucket.deleteMany({});
  const ownerAgent = request.agent(app),
    memberAgent = request.agent(app);
  const register = async (agent, name) =>
    (
      await agent
        .post('/api/auth/register')
        .set('Origin', origin)
        .send({
          name,
          email: name + '@intake.example',
          password: 'intake-long-passphrase',
        })
        .expect(201)
    ).body.user;
  const owner = await register(ownerAgent, 'IntakeOwner'),
    member = await register(memberAgent, 'IntakeMember');
  const project = await Project.create({
    owner: owner.id,
    name: 'Public proposals',
    description: 'Never public',
    milestones: [{ id: 'secret', title: 'Secret milestone', due: '', done: false }],
  });
  await ProjectMember.create({ project: project._id, user: member.id, status: 'active' });
  const endpoint = '/api/projects/' + project._id + '/intake-link';
  await ownerAgent.get(endpoint).expect(200).expect({ enabled: false });
  await memberAgent
    .post(endpoint)
    .set('Origin', origin)
    .send({ action: 'rotate' })
    .expect(403);
  await ownerAgent
    .post(endpoint)
    .set('Origin', origin)
    .send({ action: 'rotate', owner: member.id })
    .expect(400);
  const token = (
    await ownerAgent
      .post(endpoint)
      .set('Origin', origin)
      .send({ action: 'rotate' })
      .expect(200)
  ).body.token;
  assert.match(token, /^[a-f0-9]{64}$/);
  const record = await Project.findById(project._id).select('+intakeHash').lean();
  assert.equal(record.intakeHash.length, 64);
  assert.notEqual(record.intakeHash, token);
  await request(app).get('/api/intake').expect(404);
  await request(app)
    .get('/api/intake')
    .set('X-Orbit-Intake', token)
    .expect(200)
    .expect({ name: project.name });
  const draft = {
    key: crypto.randomUUID(),
    submitter: 'Workshop visitor',
    title: 'Add a beginner session',
    description: 'Useful plain text <script>no execution</script>',
    due: '2026-10-30',
    website: '',
  };
  await request(app)
    .post('/api/intake')
    .set('X-Orbit-Intake', token)
    .send(draft)
    .expect(403);
  const send = (body) =>
    request(app)
      .post('/api/intake')
      .set('Origin', origin)
      .set('X-Orbit-Intake', token)
      .send(body);
  await send({ ...draft, requester: member.id }).expect(400);
  await send({ ...draft, website: 'spam bot' }).expect(400);
  const responses = await Promise.all([send(draft), send(draft)]);
  assert.ok(responses.every((result) => result.status === 201));
  assert.ok(
    responses.every(
      (result) => result.body.task === undefined && result.body.id === undefined,
    ),
  );
  assert.equal(await WorkRequest.countDocuments({ project: project._id }), 1);
  await send({ ...draft, title: 'Changed on retry' }).expect(409);
  const list = (
    await ownerAgent.get('/api/projects/' + project._id + '/requests').expect(200)
  ).body.requests;
  assert.equal(list[0].source, 'public');
  assert.equal(list[0].submitter, draft.submitter);
  assert.equal(list[0].requester, null);
  assert.equal(list[0].canCancel, true);
  const entry = list[0];
  const memberList = (
    await memberAgent.get('/api/projects/' + project._id + '/requests').expect(200)
  ).body.requests;
  assert.equal(memberList[0].canCancel, false);
  assert.equal(memberList[0].canDecide, false);
  const accept = await ownerAgent
    .patch('/api/projects/' + project._id + '/requests/' + entry.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(200);
  const task = await Task.findById(accept.body.task).lean();
  assert.equal(task.title, draft.title);
  assert.equal(String(task.owner), owner.id);
  await ownerAgent
    .patch('/api/projects/' + project._id + '/requests/' + entry.id)
    .set('Origin', origin)
    .send({ action: 'accept' })
    .expect(200);
  assert.equal(await Task.countDocuments({ projectId: project._id }), 1);
  const next = (
    await ownerAgent
      .post(endpoint)
      .set('Origin', origin)
      .send({ action: 'rotate' })
      .expect(200)
  ).body.token;
  await request(app).get('/api/intake').set('X-Orbit-Intake', token).expect(404);
  await send(draft).expect(404);
  await request(app).get('/api/intake').set('X-Orbit-Intake', next).expect(200);
  await ownerAgent
    .post(endpoint)
    .set('Origin', origin)
    .send({ action: 'disable' })
    .expect(200);
  await request(app).get('/api/intake').set('X-Orbit-Intake', next).expect(404);
  assert.equal(await WorkRequest.countDocuments({ project: project._id }), 1);
  const last = (
    await ownerAgent
      .post(endpoint)
      .set('Origin', origin)
      .send({ action: 'rotate' })
      .expect(200)
  ).body.token;
  await User.updateOne({ _id: owner.id }, { $set: { deleting: true } });
  await request(app).get('/api/intake').set('X-Orbit-Intake', last).expect(404);
});

test('public submission limit survives retries across the shared database store', async () => {
  await RateBucket.deleteMany({});
  const owner = await User.create({
    name: 'Limited form',
    email: 'limit@intake.example',
    passwordHash: 'unused-test-value',
  });
  const { tokenHash } = await import('../server/middleware/auth.js');
  const token = 'a'.repeat(64);
  const project = await Project.create({
    owner: owner._id,
    name: 'Limited public form',
    intakeHash: tokenHash(token),
  });
  for (let index = 0; index < 8; index++)
    await request(app)
      .post('/api/intake')
      .set('Origin', origin)
      .set('X-Orbit-Intake', token)
      .send({
        key: crypto.randomUUID(),
        submitter: 'Visitor',
        title: 'Proposal ' + index,
      })
      .expect(201);
  await request(app)
    .post('/api/intake')
    .set('Origin', origin)
    .set('X-Orbit-Intake', token)
    .send({ key: crypto.randomUUID(), submitter: 'Visitor', title: 'Too many proposals' })
    .expect(429);
  assert.equal(await WorkRequest.countDocuments({ project: project._id }), 8);
});

test('targeted discussion notifications follow current task access and recipient-only acknowledgements', async () => {
  await RateBucket.deleteMany({});
  const ownerAgent = request.agent(app),
    memberAgent = request.agent(app);
  const register = async (agent, name) =>
    (
      await agent
        .post('/api/auth/register')
        .set('Origin', origin)
        .send({
          name,
          email: name + '@notification.example',
          password: 'notification-long-passphrase',
        })
        .expect(201)
    ).body.user;
  const owner = await register(ownerAgent, 'NotificationOwner');
  const member = await register(memberAgent, 'NotificationMember');
  const guest = await User.create({
    name: 'Guest recipient',
    email: 'guest@notification.example',
    passwordHash: 'unused',
  });
  const project = await Project.create({ owner: owner.id, name: 'Targeted discussions' });
  const membership = await ProjectMember.create({
    project: project._id,
    user: member.id,
    status: 'active',
  });
  await ProjectMember.create({
    project: project._id,
    user: guest._id,
    status: 'active',
    role: 'guest',
  });
  const task = await Task.create({
    owner: owner.id,
    projectId: project._id,
    project: project.name,
    title: 'Review the workshop plan',
  });
  const comments =
    '/api/projects/' + project._id + '/collaboration/' + task._id + '/comments';
  const notify = (data) => ownerAgent.post(comments).set('Origin', origin).send(data);
  await notify({ body: 'Not myself', notified: owner.id }).expect(400);
  await notify({ body: 'Not a guest', notified: String(guest._id) }).expect(400);
  await notify({ body: 'No injected identities', notified: { $ne: null } }).expect(400);
  await notify({ body: 'Private discussion details', notified: member.id }).expect(201);
  const comment = await TaskComment.findOne({ task: task._id }).lean();
  const reportPath = '/api/teams/portfolio?date=2026-10-10';
  const report = (await memberAgent.get(reportPath).expect(200)).body;
  assert.equal(report.digest.notifications.length, 1);
  assert.equal(report.digest.notifications[0].title, task.title);
  assert.ok(!JSON.stringify(report).includes('Private discussion details'));
  const listing = (await memberAgent.get(comments).expect(200)).body.comments;
  assert.equal(listing[0].notified.name, member.name);
  const readPath = comments + '/' + comment._id + '/read';
  await ownerAgent.patch(readPath).set('Origin', origin).send({}).expect(404);
  await memberAgent
    .patch(readPath)
    .set('Origin', origin)
    .send({ user: owner.id })
    .expect(400);
  await memberAgent.patch(readPath).set('Origin', origin).send({}).expect(204);
  await memberAgent.patch(readPath).set('Origin', origin).send({}).expect(204);
  assert.equal(
    (await memberAgent.get(reportPath).expect(200)).body.digest.notifications.length,
    0,
  );
  await TaskComment.updateOne({ _id: comment._id }, { $set: { seenAt: null } });
  await ProjectMember.updateOne({ _id: membership._id }, { $set: { status: 'revoked' } });
  assert.equal(
    (await memberAgent.get(reportPath).expect(200)).body.digest.notifications.length,
    0,
  );
  await memberAgent.patch(readPath).set('Origin', origin).send({}).expect(404);
  await notify({ body: 'Revoked recipient', notified: member.id }).expect(400);
  await ProjectMember.updateOne({ _id: membership._id }, { $set: { status: 'active' } });
  await Task.updateOne(
    { _id: task._id },
    { $unset: { projectId: 1 }, $set: { project: 'Private destination' } },
  );
  assert.equal(
    (await memberAgent.get(reportPath).expect(200)).body.digest.notifications.length,
    0,
  );
  await memberAgent.patch(readPath).set('Origin', origin).send({}).expect(404);
  await Task.updateOne(
    { _id: task._id },
    { $set: { projectId: project._id, project: project.name } },
  );
  assert.equal(
    (await memberAgent.get(reportPath).expect(200)).body.digest.notifications.length,
    1,
  );
  await ownerAgent
    .delete(comments + '/' + comment._id)
    .set('Origin', origin)
    .expect(204);
  assert.equal(
    (await memberAgent.get(reportPath).expect(200)).body.digest.notifications.length,
    0,
  );
  await notify({ body: 'Cleanup reference', notified: member.id }).expect(201);
  await User.updateOne({ _id: member.id }, { $set: { deleting: true } });
  const { purgeAccount } = await import('../server/lib/accountDeletion.js');
  await purgeAccount(member.id);
  assert.equal((await TaskComment.findOne({ task: task._id }).lean()).notified, null);
});

test('resource reviews capture safe task links and keep later file-link edits separate from decisions', async () => {
  await RateBucket.deleteMany({});
  const ownerAgent = request.agent(app),
    reviewerAgent = request.agent(app),
    outsiderAgent = request.agent(app);
  const register = async (agent, name) =>
    (
      await agent
        .post('/api/auth/register')
        .set('Origin', origin)
        .send({
          name,
          email: name + '@resource-review.example',
          password: 'resource-review-long-passphrase',
        })
        .expect(201)
    ).body.user;
  const owner = await register(ownerAgent, 'ResourceOwner'),
    reviewer = await register(reviewerAgent, 'ResourceReviewer');
  await register(outsiderAgent, 'ResourceOutsider');
  const project = await Project.create({
    owner: owner.id,
    name: 'Document review project',
  });
  await ProjectMember.create({
    project: project._id,
    user: reviewer.id,
    status: 'active',
  });
  const task = await Task.create({
    owner: owner.id,
    projectId: project._id,
    project: project.name,
    title: 'Review delivery guide',
  });
  const endpoint = '/api/projects/' + project._id + '/reviews';
  const submit = (body) => ownerAgent.post(endpoint).set('Origin', origin).send(body);
  const draft = { task: String(task._id), reviewer: reviewer.id, includeResources: true };
  await submit(draft).expect(400);
  await submit({
    ...draft,
    resources: [{ label: 'Injected', url: 'javascript:alert(1)' }],
  }).expect(400);
  const resource = {
    label: 'Delivery guide v1',
    url: 'https://example.com/guide-v1.pdf',
  };
  await Task.updateOne(
    { _id: task._id },
    { $set: { links: [resource] } },
    { runValidators: true },
  );
  await submit(draft).expect(201);
  await Task.updateOne(
    { _id: task._id },
    { $set: { links: [{ label: 'Guide v2', url: 'https://example.com/guide-v2.pdf' }] } },
    { runValidators: true },
  );
  const review = (await reviewerAgent.get(endpoint).expect(200)).body.reviews[0];
  assert.deepEqual(review.resources, [resource]);
  await outsiderAgent.get(endpoint).expect(404);
  await ownerAgent
    .patch(endpoint + '/' + review.id)
    .set('Origin', origin)
    .send({ action: 'approve' })
    .expect(409);
  await reviewerAgent
    .patch(endpoint + '/' + review.id)
    .set('Origin', origin)
    .send({ action: 'approve', response: 'The captured guide link is ready.' })
    .expect(204);
  assert.equal((await Task.findById(task._id).lean()).status, 'todo');
  const saved = (await ownerAgent.get(endpoint).expect(200)).body.reviews[0];
  assert.equal(saved.status, 'approved');
  assert.deepEqual(saved.resources, [resource]);
  await submit({ task: String(task._id), reviewer: reviewer.id }).expect(201);
  const pending = (await ownerAgent.get(endpoint + '?status=pending').expect(200)).body
    .reviews[0];
  assert.deepEqual(pending.resources, []);
});
