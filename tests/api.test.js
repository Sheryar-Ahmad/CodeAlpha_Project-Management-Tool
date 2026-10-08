import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../server/app.js';
import { User } from '../server/models/User.js';
import { Session } from '../server/models/Session.js';
import { Task } from '../server/models/Task.js';

import { MongoRateStore } from '../server/lib/rateStore.js';
import { RateBucket } from '../server/models/RateBucket.js';

const origin = 'http://127.0.0.1:5173';
let mongo, alice, bob, taskId;
before(async () => {
  process.env.APP_ORIGIN = origin;
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([User.init(), Session.init(), Task.init(), RateBucket.init()]);
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
