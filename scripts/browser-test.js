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
    process.env.APP_ORIGIN = 'http://127.0.0.1:5173';
    apiServer = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => apiServer.once('listening', resolve));
    port = apiServer.address().port;
  }
  vite = await createServer({
    configFile: 'vite.config.js',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': 'http://127.0.0.1:' + port },
    },
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await mkdir('docs/screenshots', { recursive: true });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('heading', { name: /Big ideas/ }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/landing-desktop.png', fullPage: true });
  await page.goto('http://127.0.0.1:5173/app.html?demo=1');
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
  console.log('Step: save task');
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await page.getByRole('heading', { name: 'Browser test task', exact: true }).waitFor();
  assert.equal(await page.locator('.task-card img').count(), 0);
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
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: 'docs/screenshots/workspace-mobile.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').count(), 0);
  console.log(
    'PASS: desktop/mobile demo, CRUD, persistence, filters, safe text rendering, dialog Escape.',
  );

  if (!demoOnly) {
    await page.getByRole('button', { name: 'Leave demo', exact: true }).click();
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
