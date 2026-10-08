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
