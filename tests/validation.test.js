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
