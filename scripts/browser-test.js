import { createServer as createPortProbe } from 'node:net';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import app from '../server/app.js';

const demoOnly = process.argv.includes('--demo-only');
let mongo, apiServer, vite, browser;
const errors = [];
try {
  let port = 3001;
  if (!demoOnly) {
    mongo = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongo.getUri();

    apiServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => apiServer.once('listening', resolve));
    port = apiServer.address().port;
  }
  const probe = createPortProbe();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const uiPort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  vite = await createServer({
    configFile: 'vite.config.js',
    server: {
      host: '127.0.0.1',
      port: uiPort,
      strictPort: true,
      proxy: { '/api': 'http://127.0.0.1:' + port },
    },
  });
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  process.env.APP_ORIGIN = origin;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('docs/screenshots', { recursive: true });
  await page.goto(origin + '/');
  await page.getByRole('heading', { name: /Big ideas/ }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/landing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  const accountLink = page
    .locator('.landing-nav')
    .getByRole('link', { name: 'Create your account', exact: true });
  assert.ok(await accountLink.isVisible());
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await accountLink.click();
  await page
    .getByRole('heading', { name: 'Start something great.', exact: true })
    .waitFor();
  assert.ok(await page.getByLabel('Your name', { exact: true }).isVisible());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/app.html?demo=1');
  await page.getByRole('heading', { name: 'Build the homepage', exact: true }).waitFor();
  await page.screenshot({
    path: 'docs/screenshots/workspace-desktop.png',
    fullPage: true,
  });
  console.log('Step: new task');
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByLabel('Task title', { exact: true }).fill('Browser test task');
  await page.getByLabel('Project', { exact: true }).fill('QA project');
  await page
    .getByLabel('Description', { exact: true })
    .fill('<img src=x onerror=alert(1)> displayed as text');
  await page.getByLabel('Due date', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: 'Add a step', exact: true }).click();
  await page.getByLabel('Checklist step 1', { exact: true }).fill('Prepare notes');
  await page.getByRole('button', { name: 'Add a step', exact: true }).click();
  await page.getByLabel('Checklist step 2', { exact: true }).fill('Review the draft');
  console.log('Step: save task');
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await page.getByRole('heading', { name: 'Browser test task', exact: true }).waitFor();
  assert.equal(await page.locator('.task-card img').count(), 0);
  await page.getByText('0/2 steps complete', { exact: true }).click();
  await page
    .getByLabel('Complete Prepare notes for Browser test task', { exact: true })
    .check();
  await page.getByText('1/2 steps complete', { exact: true }).waitFor();
  console.log('Step: change status');
  await page
    .getByLabel('Status for Browser test task', { exact: true })
    .selectOption('done');
  await page.getByRole('status').filter({ hasText: 'Saved in this browser.' }).waitFor();
  console.log('Step: reload');
  await page.reload();
  await page.getByRole('heading', { name: 'Browser test task', exact: true }).waitFor();
  assert.equal(
    await page.getByLabel('Status for Browser test task', { exact: true }).inputValue(),
    'done',
  );
  await page.getByText('1/2 steps complete', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit Browser test task', exact: true }).click();
  await page.getByLabel('Task title', { exact: true }).fill('Renamed browser task');
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Renamed browser task', exact: true })
    .waitFor();
  await page
    .getByRole('searchbox', { name: 'Search tasks' })
    .fill('No matching task exists');
  await page.waitForTimeout(450);
  assert.equal(await page.locator('.task-card').count(), 0);
  await page.getByRole('searchbox', { name: 'Search tasks' }).fill('');
  await page.waitForTimeout(450);
  await page.getByLabel('Filter by project', { exact: true }).selectOption('QA project');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.task-card').count(), 1);
  await page
    .getByRole('button', { name: 'Duplicate Renamed browser task', exact: true })
    .click();
  assert.equal(await page.getByLabel('Due date', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Status', { exact: true }).inputValue(), 'todo');
  assert.equal(
    await page.getByLabel('Mark step 1 complete', { exact: true }).isChecked(),
    false,
  );
  assert.equal(
    await page.getByLabel('Checklist step 1', { exact: true }).inputValue(),
    'Prepare notes',
  );
  await page.getByLabel('Task title', { exact: true }).fill('Reusable copy');
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await page.getByRole('heading', { name: 'Reusable copy', exact: true }).waitFor();
  const copyCard = page
    .locator('.task-card')
    .filter({ has: page.getByRole('heading', { name: 'Reusable copy', exact: true }) });
  await copyCard.getByText('0/2 steps complete', { exact: true }).waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Reusable copy', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Reusable copy', exact: true })
    .waitFor({ state: 'detached' });
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .getByRole('button', { name: 'Delete Renamed browser task', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Renamed browser task', exact: true })
    .waitFor({ state: 'detached' });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await page.getByRole('heading', { name: 'Build the homepage', exact: true }).waitFor();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Today', exact: true })
    .click();
  await page.waitForFunction(() => document.querySelectorAll('.task-card').length === 2);
  assert.ok(
    await page
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .isVisible(),
  );
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Upcoming', exact: true })
    .click();
  await page.waitForFunction(() => document.querySelectorAll('.task-card').length === 2);
  assert.ok(
    await page
      .getByRole('heading', { name: 'Review accessibility', exact: true })
      .isVisible(),
  );
  const realNow = Date.now();
  await page.clock.setSystemTime(new Date(realNow + 8 * 86400000));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => document.querySelectorAll('.task-card').length === 0);
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Today', exact: true })
    .click();
  await page.waitForFunction(() => document.querySelectorAll('.task-card').length === 4);
  await page.clock.setSystemTime(new Date(realNow));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => document.querySelectorAll('.task-card').length === 2);
  console.log('PASS: planning views refresh after the calendar day changes.');
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Projects', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Your projects', exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll('.project-card').length === 2,
  );
  await page.screenshot({
    path: 'docs/screenshots/projects-desktop.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Open tasks for Website launch', exact: true })
    .click();
  await page.waitForFunction(() => document.querySelectorAll('.task-card').length === 3);
  assert.equal(
    await page.getByLabel('Filter by project', { exact: true }).inputValue(),
    'Website launch',
  );
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Task board', exact: true })
    .click();
  await page.waitForFunction(() => document.querySelectorAll('.task-card').length === 6);
  console.log(
    'PASS: planning navigation, project progress, checklists, and safe task duplication.',
  );
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Focus timer', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Make space to focus.', exact: true })
    .waitFor();
  await page.getByLabel('Session length', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await page.reload();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Focus timer', exact: true })
    .click();
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('timer').filter({ hasText: '01:00' }).waitFor();
  await page.getByRole('button', { name: 'Start session', exact: true }).click();
  await page.evaluate(() => {
    const key = 'orbit.focus.v1.demo';
    const timer = JSON.parse(localStorage.getItem(key));
    timer.deadline = Date.now() - 1000;
    localStorage.setItem(key, JSON.stringify(timer));
  });
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Task board', exact: true })
    .click();
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Focus timer', exact: true })
    .click();
  await page
    .getByText('Focus session complete. Take a well-earned break.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByLabel('Session length', { exact: true }).selectOption('25');
  await page.screenshot({ path: 'docs/screenshots/focus-desktop.png', fullPage: true });
  await page
    .locator('.sidebar')
    .getByRole('button', { name: 'Task board', exact: true })
    .click();
  await page.waitForFunction(() => document.querySelectorAll('.task-card').length === 6);
  console.log('PASS: focus timer pause, refresh, reset, and deadline completion.');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: 'docs/screenshots/workspace-mobile.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  assert.equal(
    await page.getByRole('button', { name: 'Leave demo', exact: true }).count(),
    2,
  );
  const topExit = page
    .locator('.topbar')
    .getByRole('button', { name: 'Leave demo', exact: true });
  await topExit.scrollIntoViewIfNeeded();
  const exitBounds = await topExit.boundingBox();
  assert.ok(exitBounds && exitBounds.y >= 0 && exitBounds.y + exitBounds.height <= 812);
  await topExit.click();
  await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open the local demo', exact: true }).click();
  await page.getByRole('heading', { name: 'Build the homepage', exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 0);
  console.log(
    'PASS: desktop/mobile demo, CRUD, persistence, filters, safe text rendering, dialog Escape.',
  );

  if (!demoOnly) {
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Leave demo', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'New here? Create an account', exact: true })
      .click();
    await page.getByLabel('Your name', { exact: true }).fill('Browser Tester');
    await page.getByLabel('Email address', { exact: true }).fill('browser@example.com');
    await page.getByLabel('Password', { exact: true }).fill('browser-test-passphrase');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await page.getByLabel('Task title', { exact: true }).fill('MongoDB saved task');
    await page.getByLabel('Project', { exact: true }).fill('Account QA');
    await page.getByRole('button', { name: 'Save task', exact: true }).click();
    await page
      .getByRole('heading', { name: 'MongoDB saved task', exact: true })
      .waitFor();
    await page.reload();
    await page
      .getByRole('heading', { name: 'MongoDB saved task', exact: true })
      .waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByLabel('Email address', { exact: true }).fill('browser@example.com');
    await page.getByLabel('Password', { exact: true }).fill('browser-test-passphrase');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page
      .getByRole('heading', { name: 'MongoDB saved task', exact: true })
      .waitFor();
    console.log(
      'PASS: account registration, MongoDB task persistence, logout, and login.',
    );
  }
  assert.deepEqual(errors, []);
  console.log('PASS: no uncaught browser errors.');
} finally {
  await browser?.close();
  await vite?.close();
  if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
}
