import { createServer as createPortProbe } from 'node:net';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import app from '../server/app.js';

const teamsOnly = process.argv.includes('--teams-only');
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
  if (!teamsOnly) {
    await page.goto(origin + '/');
    await page.getByRole('heading', { name: /Big ideas/ }).waitFor();
    await page.screenshot({
      path: 'docs/screenshots/landing-desktop.png',
      fullPage: true,
    });
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
    await page
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    await page.screenshot({
      path: 'docs/screenshots/workspace-desktop.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    await page.getByRole('list', { name: 'Tasks on this page', exact: true }).waitFor();
    await page.screenshot({
      path: 'docs/screenshots/tasks-list-desktop.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Board view', exact: true }).click();
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
    await page.locator('dialog').getByText('Notes & resources', { exact: true }).click();
    await page
      .getByLabel('Notes', { exact: true })
      .fill('Decision: keep a simple delivery plan.');
    await page.getByRole('button', { name: 'Add a resource', exact: true }).click();
    await page.getByLabel('Resource label 1', { exact: true }).fill('Design brief');
    await page
      .getByLabel('Resource URL 1', { exact: true })
      .fill('https://example.com/brief');
    console.log('Step: save task');
    await page.getByRole('button', { name: 'Save task', exact: true }).click();
    await page.getByRole('heading', { name: 'Browser test task', exact: true }).waitFor();
    assert.equal(await page.locator('.task-card img').count(), 0);
    await page
      .locator('.task-card')
      .getByText('Notes & resources', { exact: true })
      .click();
    await page
      .getByText('Decision: keep a simple delivery plan.', { exact: true })
      .waitFor();
    const resource = page.getByRole('link', {
      name: 'Design brief (opens in a new tab)',
      exact: true,
    });
    assert.equal(await resource.getAttribute('href'), 'https://example.com/brief');
    assert.equal(await resource.getAttribute('rel'), 'noopener noreferrer');
    await page.getByText('0/2 steps complete', { exact: true }).click();
    await page
      .getByLabel('Complete Prepare notes for Browser test task', { exact: true })
      .click();
    await page.getByText('1/2 steps complete', { exact: true }).waitFor();
    await page
      .getByLabel('Status for Browser test task', { exact: true })
      .selectOption('blocked');
    await page
      .getByLabel('Blocker reason', { exact: true })
      .fill('Waiting for the final brief');
    await page.getByRole('button', { name: 'Save task', exact: true }).click();
    await page.getByText('Waiting for the final brief', { exact: true }).waitFor();
    await page
      .locator('.sidebar')
      .getByRole('button', { name: /^Blockers/ })
      .click();
    await page.getByRole('heading', { name: 'Browser test task', exact: true }).waitFor();
    assert.equal(await page.locator('.task-card').count(), 1);
    await page
      .getByLabel('Status for Browser test task', { exact: true })
      .selectOption('todo');
    await page.getByText('Nothing is blocked here.', { exact: true }).waitFor();
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Task board', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Browser test task', exact: true }).waitFor();
    assert.equal(
      await page.getByText('Waiting for the final brief', { exact: true }).count(),
      0,
    );
    console.log('PASS: blocker reasons, dedicated view, and unblocking.');
    console.log('Step: change status');
    await page
      .getByLabel('Status for Browser test task', { exact: true })
      .selectOption('done');
    await page
      .getByRole('status')
      .filter({ hasText: 'Saved in this browser.' })
      .waitFor();
    console.log('Step: reload');
    await page.reload();
    await page.getByRole('heading', { name: 'Browser test task', exact: true }).waitFor();
    assert.equal(
      await page.getByLabel('Status for Browser test task', { exact: true }).inputValue(),
      'done',
    );
    await page.getByText('1/2 steps complete', { exact: true }).waitFor();
    await page
      .getByRole('button', { name: 'Edit Browser test task', exact: true })
      .click();
    assert.equal(
      await page.getByLabel('Notes', { exact: true }).inputValue(),
      'Decision: keep a simple delivery plan.',
    );
    assert.equal(
      await page.getByLabel('Resource URL 1', { exact: true }).inputValue(),
      'https://example.com/brief',
    );
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
    await page
      .getByLabel('Filter by project', { exact: true })
      .selectOption('QA project');
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
    await page
      .locator('.sidebar')
      .getByRole('button', { name: /^Trash/ })
      .click();
    await page
      .getByRole('heading', { name: 'Renamed browser task', exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Edit Renamed browser task', exact: true })
        .count(),
      0,
    );
    await page.getByText('1/2 steps complete', { exact: true }).click();
    assert.equal(
      await page
        .getByLabel('Complete Prepare notes for Renamed browser task', { exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole('button', { name: 'Restore Renamed browser task', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Renamed browser task', exact: true })
      .waitFor({ state: 'detached' });
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Task board', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Renamed browser task', exact: true })
      .waitFor();
    await page
      .getByRole('button', { name: 'Archive Renamed browser task', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Renamed browser task', exact: true })
      .waitFor({ state: 'detached' });
    await page
      .locator('.sidebar')
      .getByRole('button', { name: /^Archive/ })
      .click();
    await page
      .getByRole('heading', { name: 'Renamed browser task', exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel('Status for Renamed browser task', { exact: true }).count(),
      0,
    );
    const demoDownloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export tasks', exact: true }).click();
    const demoDownload = await demoDownloadEvent;
    await demoDownload.saveAs('.cache/demo-task-export.json');
    const demoExport = JSON.parse(await readFile('.cache/demo-task-export.json', 'utf8'));
    assert.equal(demoExport.scope, 'demo');
    assert.equal(demoExport.tasks.length, 8);
    assert.equal(
      demoExport.tasks.find((task) => task.title === 'Renamed browser task').lifecycle,
      'archived',
    );
    assert.equal(
      demoExport.tasks.find((task) => task.title === 'Reusable copy').lifecycle,
      'trashed',
    );
    assert.equal(
      demoExport.tasks.find((task) => task.title === 'Renamed browser task').notes,
      'Decision: keep a simple delivery plan.',
    );
    console.log(
      'PASS: downloaded demo export includes active, archived, and trashed tasks.',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', { name: 'Delete Renamed browser task', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'No archived tasks yet', exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'New task', exact: true }).count(),
      0,
    );
    await page
      .locator('.sidebar')
      .getByRole('button', { name: /^Trash/ })
      .click();
    await page
      .getByRole('heading', { name: 'Renamed browser task', exact: true })
      .waitFor();
    page.once('dialog', (dialog) => dialog.dismiss());
    await page
      .getByRole('button', {
        name: 'Permanently delete Renamed browser task',
        exact: true,
      })
      .click();
    assert.ok(
      await page
        .getByRole('heading', { name: 'Renamed browser task', exact: true })
        .isVisible(),
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', {
        name: 'Permanently delete Renamed browser task',
        exact: true,
      })
      .click();
    await page
      .getByRole('heading', { name: 'Renamed browser task', exact: true })
      .waitFor({ state: 'detached' });
    await page
      .getByRole('button', { name: 'Restore Reusable copy', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Trash is empty', exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Create a task', exact: true }).count(),
      0,
    );
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Task board', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Reusable copy', exact: true }).waitFor();
    console.log(
      'PASS: demo archive, read-only recovery views, restore, and guarded permanent deletion.',
    );
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Today', exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll('.task-card').length === 2,
    );
    assert.ok(
      await page
        .getByRole('heading', { name: 'Build the homepage', exact: true })
        .isVisible(),
    );
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Upcoming', exact: true })
      .click();
    // Both calendar views contain two samples; wait for the new view's content first.
    await page
      .getByRole('heading', { name: 'Review accessibility', exact: true })
      .waitFor();
    await page.waitForFunction(
      () => document.querySelectorAll('.task-card').length === 2,
    );
    const realNow = Date.now();
    await page.clock.setSystemTime(new Date(realNow + 8 * 86400000));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(
      () => document.querySelectorAll('.task-card').length === 0,
    );
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Today', exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll('.task-card').length === 4,
    );
    await page.clock.setSystemTime(new Date(realNow));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(
      () => document.querySelectorAll('.task-card').length === 2,
    );
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
    await page.waitForFunction(
      () => document.querySelectorAll('.task-card').length === 3,
    );
    assert.equal(
      await page.getByLabel('Filter by project', { exact: true }).inputValue(),
      'Website launch',
    );
    await page
      .locator('.sidebar')
      .getByRole('button', { name: 'Task board', exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelectorAll('.task-card').length === 6,
    );
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
    await page.waitForFunction(
      () => document.querySelectorAll('.task-card').length === 6,
    );
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
    await page
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'New task', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').count(), 0);
    console.log(
      'PASS: desktop/mobile demo, CRUD, persistence, filters, safe text rendering, dialog Escape.',
    );

    const projectPage = await browser.newPage({
      viewport: { width: 320, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    projectPage.on('pageerror', (error) => errors.push(error.message));
    await projectPage.goto(origin + '/app.html?demo=1');
    await projectPage
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    await projectPage
      .locator('.sidebar')
      .getByRole('button', { name: 'Projects', exact: true })
      .click();
    await projectPage
      .getByRole('button', {
        name: 'Add project details for Website launch',
        exact: true,
      })
      .click();
    await projectPage
      .getByLabel('Project description', { exact: true })
      .fill('A clear launch plan with accessible delivery.');
    await projectPage
      .getByLabel('Project start date', { exact: true })
      .fill('2026-10-10');
    await projectPage
      .getByLabel('Project target date', { exact: true })
      .fill('2026-10-09');
    await projectPage.getByRole('button', { name: 'Save project', exact: true }).click();
    await projectPage
      .getByText('The target date cannot be before the start date.', { exact: true })
      .waitFor();
    await projectPage
      .getByLabel('Project target date', { exact: true })
      .fill('2026-10-30');
    await projectPage
      .getByLabel('Project status', { exact: true })
      .selectOption('active');
    assert.equal(
      await projectPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await projectPage.getByRole('button', { name: 'Save project', exact: true }).click();
    await projectPage
      .getByRole('button', {
        name: 'Edit project details for Website launch',
        exact: true,
      })
      .waitFor();
    await projectPage.getByRole('button', { name: 'New project', exact: true }).click();
    await projectPage
      .getByLabel('Project name', { exact: true })
      .fill('A project with no tasks');
    await projectPage
      .getByLabel('Project description', { exact: true })
      .fill('<img src=x onerror=alert(1)> stays plain text');
    await projectPage.getByRole('button', { name: 'Save project', exact: true }).click();
    await projectPage
      .getByRole('heading', { name: 'A project with no tasks', exact: true })
      .waitFor();
    const emptyProject = projectPage.locator('.project-card').filter({
      has: projectPage.getByRole('heading', {
        name: 'A project with no tasks',
        exact: true,
      }),
    });
    assert.equal(
      await emptyProject.getByRole('progressbar').getAttribute('aria-valuenow'),
      '0',
    );
    await emptyProject.getByText('Project brief', { exact: true }).click();
    assert.equal(await projectPage.locator('.project-card img').count(), 0);
    await projectPage.getByRole('button', { name: 'New project', exact: true }).click();
    await projectPage
      .getByLabel('Project name', { exact: true })
      .fill('A project with no tasks');
    await projectPage.getByRole('button', { name: 'Save project', exact: true }).click();
    await projectPage
      .getByRole('alert')
      .filter({ hasText: 'Names must be unique' })
      .waitFor();
    await projectPage.getByRole('button', { name: 'Cancel', exact: true }).click();
    await projectPage.reload();
    await projectPage
      .locator('.sidebar')
      .getByRole('button', { name: 'Projects', exact: true })
      .click();
    await projectPage
      .getByRole('button', {
        name: 'Edit project details for A project with no tasks',
        exact: true,
      })
      .click();
    assert.equal(
      await projectPage
        .getByLabel('Project name', { exact: true })
        .getAttribute('readonly'),
      '',
    );
    await projectPage
      .getByLabel('Project status', { exact: true })
      .selectOption('onhold');
    await projectPage.getByRole('button', { name: 'Save project', exact: true }).click();
    await projectPage
      .getByRole('button', {
        name: 'Open tasks for A project with no tasks',
        exact: true,
      })
      .click();
    await projectPage.getByRole('button', { name: 'New task', exact: true }).click();
    assert.equal(
      await projectPage.getByLabel('Project', { exact: true }).inputValue(),
      'A project with no tasks',
    );
    await projectPage
      .getByLabel('Task title', { exact: true })
      .fill('First project task');
    await projectPage.getByRole('button', { name: 'Save task', exact: true }).click();
    await projectPage
      .getByRole('heading', { name: 'First project task', exact: true })
      .waitFor();
    await projectPage
      .locator('.sidebar')
      .getByRole('button', { name: 'Projects', exact: true })
      .click();
    await projectPage
      .getByRole('heading', { name: 'A project with no tasks', exact: true })
      .waitFor();
    await projectPage
      .locator('.project-card')
      .filter({
        has: projectPage.getByRole('heading', {
          name: 'A project with no tasks',
          exact: true,
        }),
      })
      .getByText('0 of 1 tasks complete', { exact: true })
      .waitFor();
    assert.equal(await projectPage.locator('.project-card').count(), 3);
    assert.equal(
      await projectPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await projectPage.setViewportSize({ width: 1440, height: 1000 });
    await projectPage.screenshot({
      path: 'docs/screenshots/projects-desktop.png',
      fullPage: true,
    });
    projectPage.once('dialog', (dialog) => dialog.accept());
    await projectPage.getByRole('button', { name: 'Reset demo', exact: true }).click();
    await projectPage
      .getByRole('heading', { name: 'A project with no tasks', exact: true })
      .waitFor({ state: 'detached' });
    assert.equal(
      await projectPage.evaluate(() => localStorage.getItem('orbit.projects.v1')),
      null,
    );
    await projectPage.close();
    console.log(
      'PASS: project details, dates, duplicates, empty projects, mobile forms, persistence, and demo reset.',
    );

    // Templates preview without saving and protect work already typed into the form.
    const templatePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
    templatePage.on('pageerror', (error) => errors.push(error.message));
    await templatePage.goto(origin + '/app.html?demo=1');
    await templatePage
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    await templatePage.getByRole('button', { name: 'New task', exact: true }).click();
    await templatePage.getByLabel('Project', { exact: true }).fill('Weekly planning');
    await templatePage.getByLabel('Due date', { exact: true }).fill('2026-10-20');
    await templatePage
      .getByLabel('Task template', { exact: true })
      .selectOption('review');
    await templatePage.getByText('Preview weekly review', { exact: true }).click();
    await templatePage
      .getByText('Choose the next three priorities', { exact: true })
      .waitFor();
    await templatePage.getByRole('button', { name: 'Use template', exact: true }).click();
    assert.equal(
      await templatePage.getByLabel('Project', { exact: true }).inputValue(),
      'Weekly planning',
    );
    assert.equal(
      await templatePage.getByLabel('Due date', { exact: true }).inputValue(),
      '2026-10-20',
    );
    assert.equal(
      await templatePage.getByLabel('Checklist step 1', { exact: true }).inputValue(),
      'Review finished and unfinished work',
    );
    assert.equal(
      await templatePage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await templatePage.getByLabel('Task title', { exact: true }).fill('My weekly review');
    await templatePage
      .getByLabel('Task template', { exact: true })
      .selectOption('kickoff');
    templatePage.once('dialog', (dialog) => dialog.dismiss());
    await templatePage.getByRole('button', { name: 'Use template', exact: true }).click();
    assert.equal(
      await templatePage.getByLabel('Task title', { exact: true }).inputValue(),
      'My weekly review',
    );
    templatePage.once('dialog', (dialog) => dialog.accept());
    await templatePage.getByRole('button', { name: 'Use template', exact: true }).click();
    assert.equal(
      await templatePage.getByLabel('Task title', { exact: true }).inputValue(),
      'Plan the project kickoff',
    );
    await templatePage.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await templatePage.locator('.task-card').count(), 6);
    await templatePage.getByRole('button', { name: 'New task', exact: true }).click();
    await templatePage
      .getByLabel('Task template', { exact: true })
      .selectOption('meeting');
    await templatePage.getByRole('button', { name: 'Use template', exact: true }).click();
    await templatePage.getByLabel('Project', { exact: true }).fill('Follow-ups');
    await templatePage.getByRole('button', { name: 'Save task', exact: true }).click();
    await templatePage
      .getByRole('heading', { name: 'Follow up on the meeting', exact: true })
      .waitFor();
    await templatePage.reload();
    await templatePage
      .getByRole('heading', { name: 'Follow up on the meeting', exact: true })
      .waitFor();
    await templatePage
      .getByRole('button', { name: 'Edit Follow up on the meeting', exact: true })
      .click();
    assert.equal(
      await templatePage.getByLabel('Task template', { exact: true }).count(),
      0,
    );
    assert.equal(
      await templatePage.getByLabel('Checklist step 4', { exact: true }).inputValue(),
      'Check that the next steps are understood',
    );
    await templatePage.getByRole('button', { name: 'Cancel', exact: true }).click();
    await templatePage.getByRole('button', { name: 'List view', exact: true }).click();
    await templatePage
      .getByRole('list', { name: 'Tasks on this page', exact: true })
      .waitFor();
    assert.equal(await templatePage.locator('.task-list > li').count(), 7);
    assert.equal(
      await templatePage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await templatePage
      .getByLabel('Filter by project', { exact: true })
      .selectOption('Follow-ups');
    await templatePage
      .getByRole('heading', { name: 'Follow up on the meeting', exact: true })
      .waitFor();
    assert.equal(await templatePage.locator('.task-list > li').count(), 1);
    await templatePage.getByText('0/4 steps complete', { exact: true }).click();
    await templatePage
      .getByLabel('Complete Write down the key decisions for Follow up on the meeting', {
        exact: true,
      })
      .click();
    // Checkbox state comes from persisted task data, not an immediate DOM toggle.
    await templatePage.getByText('1/4 steps complete', { exact: true }).waitFor();
    await templatePage
      .getByLabel('Status for Follow up on the meeting', { exact: true })
      .selectOption('blocked');
    await templatePage
      .getByLabel('Blocker reason', { exact: true })
      .fill('Waiting for the shared notes');
    await templatePage.getByRole('button', { name: 'Save task', exact: true }).click();
    await templatePage
      .getByText('Waiting for the shared notes', { exact: true })
      .waitFor();
    await templatePage
      .locator('.sidebar')
      .getByRole('button', { name: /^Blockers/ })
      .click();
    await templatePage
      .getByRole('list', { name: 'Tasks on this page', exact: true })
      .waitFor();
    await templatePage
      .getByRole('searchbox', { name: 'Search tasks' })
      .fill('Missing task');
    await templatePage
      .getByRole('heading', { name: 'No matching tasks on this page', exact: true })
      .waitFor();
    await templatePage.getByRole('searchbox', { name: 'Search tasks' }).fill('');
    await templatePage
      .getByRole('heading', { name: 'Follow up on the meeting', exact: true })
      .waitFor();
    await templatePage.close();
    console.log(
      'PASS: list mobile layout, filtering, checklists, blockers, and empty search results.',
    );
    console.log(
      'PASS: template previews, mobile layout, replacement confirmation, cancellation, and saved checklists.',
    );

    const repeatPage = await browser.newPage({ viewport: { width: 375, height: 812 } });
    repeatPage.on('pageerror', (error) => errors.push(error.message));
    await repeatPage.goto(origin + '/app.html?demo=1');
    await repeatPage
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    await repeatPage.getByRole('button', { name: 'New task', exact: true }).click();
    await repeatPage
      .getByLabel('Task title', { exact: true })
      .fill('Monthly browser review');
    await repeatPage.getByLabel('Project', { exact: true }).fill('Recurring QA');
    await repeatPage.getByLabel('Repeat', { exact: true }).selectOption('monthly');
    await repeatPage.getByRole('button', { name: 'Save task', exact: true }).click();
    await repeatPage
      .getByText('Repeating tasks need a due date.', { exact: true })
      .waitFor();
    await repeatPage.getByLabel('Due date', { exact: true }).fill('2027-01-31');
    await repeatPage.getByRole('button', { name: 'Add a step', exact: true }).click();
    await repeatPage
      .getByLabel('Checklist step 1', { exact: true })
      .fill('Review this month');
    await repeatPage.getByLabel('Mark step 1 complete', { exact: true }).check();
    await repeatPage.getByRole('button', { name: 'Save task', exact: true }).click();
    await repeatPage
      .getByRole('heading', { name: 'Monthly browser review', exact: true })
      .waitFor();
    await repeatPage
      .getByLabel('Status for Monthly browser review', { exact: true })
      .selectOption('done');
    await repeatPage.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('orbit.tasks.v1') ?? '[]').filter(
          (task) => task.title === 'Monthly browser review',
        ).length === 2,
    );
    await repeatPage.reload();
    await repeatPage
      .getByRole('heading', { name: 'Monthly browser review', exact: true })
      .first()
      .waitFor();
    const occurrences = await repeatPage.evaluate(() =>
      JSON.parse(localStorage.getItem('orbit.tasks.v1') ?? '[]').filter(
        (task) => task.title === 'Monthly browser review',
      ),
    );
    const original = occurrences.find((task) => task.status === 'done');
    const february = occurrences.find((task) => task.status === 'todo');
    assert.equal(original.checklist[0].done, true);
    assert.equal(february.due, '2027-02-28');
    assert.equal(february.checklist[0].done, false);
    await repeatPage
      .locator('.task-card')
      .filter({ has: repeatPage.locator('#status-' + february.id) })
      .getByRole('button', { name: 'Edit Monthly browser review', exact: true })
      .click();
    await repeatPage.getByRole('button', { name: 'Save task', exact: true }).click();
    await repeatPage.locator('#status-' + february.id).selectOption('done');
    await repeatPage.waitForFunction(() =>
      JSON.parse(localStorage.getItem('orbit.tasks.v1') ?? '[]').some(
        (task) => task.title === 'Monthly browser review' && task.due === '2027-03-31',
      ),
    );
    await repeatPage.locator('#status-' + original.id).selectOption('todo');
    await repeatPage.locator('#status-' + original.id).selectOption('done');
    await repeatPage.waitForTimeout(100);
    assert.equal(
      await repeatPage.evaluate(
        () =>
          JSON.parse(localStorage.getItem('orbit.tasks.v1') ?? '[]').filter(
            (task) => task.title === 'Monthly browser review',
          ).length,
      ),
      3,
    );
    assert.equal(
      await repeatPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await repeatPage.close();
    console.log(
      'PASS: recurring demo validation, history, fresh steps, monthly anchors, and completion retries.',
    );

    // Use a separate browser profile so large-board checks do not change demo screenshots.
    const paginationPage = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    paginationPage.on('pageerror', (error) => errors.push(error.message));
    await paginationPage.goto(origin + '/app.html?demo=1');
    await paginationPage
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    await paginationPage.evaluate(() => {
      const tasks = Array.from({ length: 31 }, (_, index) => ({
        id: crypto.randomUUID(),
        title: 'Pagination task ' + index,
        project: 'Pagination QA',
        description: '',
        priority: 'medium',
        status: 'todo',
        due: '',
        checklist: [],
      }));
      localStorage.setItem('orbit.tasks.v1', JSON.stringify(tasks));
    });
    await paginationPage.reload();
    await paginationPage
      .getByRole('heading', { name: 'Pagination task 0', exact: true })
      .waitFor();
    await paginationPage.getByRole('button', { name: 'List view', exact: true }).click();
    await paginationPage.getByRole('button', { name: 'Next', exact: true }).click();
    await paginationPage
      .getByRole('heading', { name: 'Pagination task 30', exact: true })
      .waitFor();
    // The initial empty search used to schedule a page reset after 250ms.
    await paginationPage.waitForTimeout(350);
    assert.equal(await paginationPage.locator('.task-card').count(), 1);
    assert.ok(
      await paginationPage
        .getByRole('heading', { name: 'Pagination task 30', exact: true })
        .isVisible(),
    );
    assert.equal(await paginationPage.locator('.task-list > li').count(), 1);
    await paginationPage.getByRole('button', { name: 'Board view', exact: true }).click();
    assert.ok(
      await paginationPage
        .getByRole('heading', { name: 'Pagination task 30', exact: true })
        .isVisible(),
    );
    await paginationPage.getByRole('button', { name: 'Previous', exact: true }).click();
    await paginationPage
      .getByRole('heading', { name: 'Pagination task 0', exact: true })
      .waitFor();
    assert.equal(await paginationPage.locator('.task-card').count(), 30);
    await paginationPage.close();
    console.log(
      'PASS: next and previous pages remain stable after the initial search debounce.',
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
      await page
        .getByRole('button', { name: 'Archive MongoDB saved task', exact: true })
        .click();
      await page
        .getByRole('heading', { name: 'MongoDB saved task', exact: true })
        .waitFor({ state: 'detached' });
      await page.reload();
      await page
        .locator('.sidebar')
        .getByRole('button', { name: /^Archive/ })
        .click();
      await page
        .getByRole('heading', { name: 'MongoDB saved task', exact: true })
        .waitFor();
      await page
        .getByRole('button', { name: 'Restore MongoDB saved task', exact: true })
        .click();
      await page
        .getByRole('heading', { name: 'No archived tasks yet', exact: true })
        .waitFor();
      await page
        .locator('.sidebar')
        .getByRole('button', { name: 'Task board', exact: true })
        .click();
      await page
        .getByRole('heading', { name: 'MongoDB saved task', exact: true })
        .waitFor();
      const accountDownloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export tasks', exact: true }).click();
      const accountDownload = await accountDownloadEvent;
      await accountDownload.saveAs('.cache/account-task-export.json');
      const accountExport = JSON.parse(
        await readFile('.cache/account-task-export.json', 'utf8'),
      );
      assert.equal(accountExport.scope, 'account');
      assert.equal(accountExport.tasks.length, 1);
      assert.equal(accountExport.tasks[0].title, 'MongoDB saved task');
      assert.equal(accountExport.tasks[0].lifecycle, 'active');
      console.log('PASS: account task export downloads only its own records.');
      await page
        .locator('.sidebar')
        .getByRole('button', { name: 'Projects', exact: true })
        .click();
      await page.getByRole('button', { name: 'New project', exact: true }).click();
      await page.getByLabel('Project name', { exact: true }).fill('Account launch');
      await page
        .getByLabel('Project description', { exact: true })
        .fill('Private MongoDB project brief');
      await page.getByRole('button', { name: 'Save project', exact: true }).click();
      await page.getByRole('heading', { name: 'Account launch', exact: true }).waitFor();
      await page.reload();
      await page
        .locator('.sidebar')
        .getByRole('button', { name: 'Projects', exact: true })
        .click();
      await page
        .getByRole('button', {
          name: 'Edit project details for Account launch',
          exact: true,
        })
        .click();
      assert.equal(
        await page.getByLabel('Project description', { exact: true }).inputValue(),
        'Private MongoDB project brief',
      );
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      console.log('PASS: account project details persist in MongoDB.');
      console.log('PASS: account archive and restoration persist in MongoDB.');
      console.log(
        'PASS: account registration, MongoDB task persistence, logout, and login.',
      );
    }

    const calendarPage = await browser.newPage({
      viewport: { width: 320, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    calendarPage.on('pageerror', (error) => errors.push(error.message));
    await calendarPage.goto(origin + '/app.html?demo=1');
    await calendarPage
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    await calendarPage.evaluate(() => {
      const base = {
        project: 'Calendar QA',
        description: '',
        priority: 'low',
        status: 'todo',
        due: '2026-10-30',
        lifecycle: 'active',
      };
      localStorage.setItem(
        'orbit.tasks.v1',
        JSON.stringify([
          ...Array.from({ length: 35 }, (_, index) => ({
            ...base,
            id: 'calendar-' + index,
            title: 'Month deadline ' + index,
          })),
          {
            ...base,
            id: 'attention-blocked',
            title: 'Waiting for access',
            status: 'blocked',
            blockerReason: 'Need permission',
            priority: 'high',
            due: '2026-10-08',
          },
          {
            ...base,
            id: 'attention-undated',
            title: 'Urgent without a date',
            priority: 'high',
            due: '',
          },
          { ...base, id: 'attention-soon', title: 'Due soon', due: '2026-10-12' },
          {
            ...base,
            id: 'calendar-completed',
            title: 'Completed deadline',
            status: 'done',
            due: '2026-10-12',
          },
          {
            ...base,
            id: 'calendar-archived',
            title: 'Archived deadline',
            lifecycle: 'archived',
            due: '2026-10-12',
          },
          { ...base, id: 'calendar-leap', title: 'Leap deadline', due: '2028-02-29' },
        ]),
      );
    });
    await calendarPage.reload();
    await calendarPage.getByRole('button', { name: 'Calendar', exact: true }).click();
    await calendarPage.getByLabel('Calendar month', { exact: true }).fill('2026-10');
    await calendarPage
      .getByText('37 dated tasks in this month', { exact: true })
      .waitFor();
    await calendarPage
      .getByRole('button', { name: 'October 30, 2026, 35 tasks', exact: true })
      .click();
    assert.equal(
      await calendarPage
        .getByRole('list', { name: 'Tasks for selected day' })
        .locator('.task-card')
        .count(),
      35,
    );
    await calendarPage
      .getByRole('button', { name: 'October 12, 2026, 1 task', exact: true })
      .click();
    assert.equal(
      await calendarPage
        .getByRole('heading', { name: 'Completed deadline', exact: true })
        .count(),
      0,
    );
    await calendarPage.getByLabel('Show completed tasks', { exact: true }).check();
    await calendarPage
      .getByRole('heading', { name: 'Completed deadline', exact: true })
      .waitFor();
    assert.equal(
      await calendarPage
        .getByRole('heading', { name: 'Archived deadline', exact: true })
        .count(),
      0,
    );
    await calendarPage
      .getByRole('button', { name: 'Add task for this day', exact: true })
      .click();
    assert.equal(
      await calendarPage.getByLabel('Due date', { exact: true }).inputValue(),
      '2026-10-12',
    );
    await calendarPage
      .getByLabel('Task title', { exact: true })
      .fill('Planned from calendar');
    await calendarPage.getByLabel('Project', { exact: true }).fill('Calendar QA');
    await calendarPage.getByRole('button', { name: 'Save task', exact: true }).click();
    await calendarPage
      .getByRole('heading', { name: 'Planned from calendar', exact: true })
      .waitFor();
    await calendarPage
      .getByRole('button', { name: 'Edit Planned from calendar', exact: true })
      .click();
    await calendarPage.getByLabel('Due date', { exact: true }).fill('2026-10-13');
    await calendarPage.getByRole('button', { name: 'Save task', exact: true }).click();
    await calendarPage
      .getByRole('heading', { name: 'Planned from calendar', exact: true })
      .waitFor({ state: 'hidden' });
    await calendarPage
      .getByRole('button', { name: 'October 13, 2026, 1 task', exact: true })
      .click();
    await calendarPage
      .getByRole('heading', { name: 'Planned from calendar', exact: true })
      .waitFor();
    await calendarPage
      .getByLabel('Calendar project', { exact: true })
      .selectOption('Calendar QA');
    await calendarPage.getByLabel('Calendar month', { exact: true }).fill('2028-02');
    await calendarPage
      .getByText('1 dated tasks in this month', { exact: true })
      .waitFor();
    await calendarPage
      .getByRole('button', { name: 'February 29, 2028, 1 task', exact: true })
      .click();
    await calendarPage
      .getByRole('heading', { name: 'Leap deadline', exact: true })
      .waitFor();
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await calendarPage.setViewportSize({ width, height: 1000 });
      assert.equal(
        await calendarPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        'Calendar overflow at ' + width,
      );
    }
    await calendarPage.screenshot({
      path: 'docs/screenshots/calendar-desktop.png',
      fullPage: true,
    });
    await calendarPage.getByLabel('Calendar month', { exact: true }).fill('2000-01');
    assert.equal(
      await calendarPage
        .getByRole('button', { name: 'Previous month', exact: true })
        .isDisabled(),
      true,
    );
    await calendarPage.getByLabel('Calendar month', { exact: true }).fill('2100-12');
    assert.equal(
      await calendarPage
        .getByRole('button', { name: 'Next month', exact: true })
        .isDisabled(),
      true,
    );
    // Freeze the calendar day so attention rules do not depend on when CI runs.
    await calendarPage.clock.install({ time: new Date('2026-10-09T12:00:00') });
    await calendarPage.reload();
    await calendarPage
      .getByRole('button', { name: 'Action Center', exact: true })
      .click();
    await calendarPage
      .getByRole('heading', { name: 'Work that needs attention', exact: true })
      .waitFor();
    await calendarPage.getByRole('button', { name: 'List view', exact: true }).click();
    await calendarPage
      .getByRole('heading', { name: 'Waiting for access', exact: true })
      .waitFor();
    assert.equal(
      await calendarPage
        .getByRole('list', { name: 'Tasks on this page' })
        .locator('.task-card')
        .count(),
      3,
    );
    assert.equal(
      await calendarPage
        .getByRole('heading', { name: 'Completed deadline', exact: true })
        .count(),
      0,
    );
    await calendarPage.getByLabel('Search tasks', { exact: true }).fill('urgent');
    await calendarPage
      .getByRole('heading', { name: 'Waiting for access', exact: true })
      .waitFor({ state: 'hidden' });
    await calendarPage
      .getByRole('heading', { name: 'Urgent without a date', exact: true })
      .waitFor();
    await calendarPage.getByLabel('Search tasks', { exact: true }).fill('');
    await calendarPage
      .getByRole('heading', { name: 'Waiting for access', exact: true })
      .waitFor();
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await calendarPage.setViewportSize({ width, height: 1000 });
      assert.equal(
        await calendarPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        'Action Center overflow at ' + width,
      );
    }
    await calendarPage.screenshot({
      path: 'docs/screenshots/action-center-desktop.png',
      fullPage: true,
    });
    await calendarPage.close();
    console.log(
      'PASS: month calendar, whole-month data, selected-day CRUD, leap dates, attention search, and mobile layouts.',
    );

    const milestonePage = await browser.newPage({
      viewport: { width: 320, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    milestonePage.on('pageerror', (error) => errors.push(error.message));
    await milestonePage.clock.install({ time: new Date('2026-10-09T12:00:00') });
    await milestonePage.goto(origin + '/app.html?demo=1');
    await milestonePage
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    await milestonePage
      .getByRole('button', { name: 'Search workspace', exact: true })
      .click();
    await milestonePage
      .getByLabel('Search workspace commands', { exact: true })
      .fill('calendar');
    await milestonePage
      .getByLabel('Search workspace commands', { exact: true })
      .press('Enter');
    await milestonePage
      .getByRole('heading', { name: 'Your deadline calendar', exact: true })
      .waitFor();
    await milestonePage.keyboard.press('Control+k');
    await milestonePage
      .getByRole('dialog', { name: 'Find your next step', exact: true })
      .waitFor();
    await milestonePage.keyboard.press('Escape');
    await milestonePage.getByRole('dialog').waitFor({ state: 'hidden' });
    await milestonePage
      .getByRole('button', { name: 'Search workspace', exact: true })
      .click();
    await milestonePage
      .getByLabel('Search workspace commands', { exact: true })
      .fill('Build the homepage');
    await milestonePage
      .getByRole('button', {
        name: 'Search all tasks for “Build the homepage”',
        exact: true,
      })
      .click();
    await milestonePage
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    assert.equal(
      await milestonePage.getByLabel('Search tasks', { exact: true }).inputValue(),
      'Build the homepage',
    );
    await milestonePage.getByRole('button', { name: 'Projects', exact: true }).click();
    await milestonePage.getByRole('button', { name: 'New project', exact: true }).click();
    await milestonePage
      .getByLabel('Project name', { exact: true })
      .fill('Milestone release');
    await milestonePage
      .getByLabel('Project target date', { exact: true })
      .fill('2026-10-08');
    await milestonePage.getByText('Milestones (0/20)', { exact: true }).click();
    await milestonePage
      .getByRole('button', { name: 'Add milestone', exact: true })
      .click();
    await milestonePage
      .getByLabel('Milestone title 1', { exact: true })
      .fill('Prepare launch');
    await milestonePage
      .getByLabel('Milestone due date 1', { exact: true })
      .fill('2026-10-08');
    await milestonePage
      .getByRole('button', { name: 'Save project', exact: true })
      .click();
    const milestoneCard = milestonePage.locator('.project-card').filter({
      has: milestonePage.getByRole('heading', { name: 'Milestone release', exact: true }),
    });
    await milestoneCard.getByText('Needs attention', { exact: true }).click();
    await milestoneCard.getByText('1 overdue milestones', { exact: true }).waitFor();
    await milestoneCard
      .getByText('Project target date has passed', { exact: true })
      .waitFor();
    await milestoneCard.getByText('Milestones (0/1)', { exact: true }).click();
    await milestoneCard.getByText('Prepare launch', { exact: true }).waitFor();
    await milestonePage.reload();
    await milestonePage.getByRole('button', { name: 'Projects', exact: true }).click();
    await milestonePage
      .getByRole('button', {
        name: 'Edit project details for Milestone release',
        exact: true,
      })
      .click();
    await milestonePage.getByText('Milestones (1/20)', { exact: true }).click();
    assert.equal(
      await milestonePage.getByLabel('Milestone title 1', { exact: true }).inputValue(),
      'Prepare launch',
    );
    await milestonePage.getByLabel('Milestone completed 1', { exact: true }).check();
    await milestonePage
      .getByLabel('Project status', { exact: true })
      .selectOption('completed');
    await milestonePage
      .getByRole('button', { name: 'Save project', exact: true })
      .click();
    await milestoneCard.getByText('No current flags', { exact: true }).waitFor();
    await milestoneCard.getByText('Milestones (1/1)', { exact: true }).waitFor();
    await milestonePage
      .getByRole('button', { name: 'Search workspace', exact: true })
      .click();
    await milestonePage
      .getByLabel('Search workspace commands', { exact: true })
      .fill('Milestone release');
    await milestonePage
      .getByRole('button', { name: 'View tasks: Milestone release', exact: true })
      .click();
    assert.equal(
      await milestonePage.getByLabel('Filter by project', { exact: true }).inputValue(),
      'Milestone release',
    );
    for (const width of [320, 375, 768, 1024, 1440]) {
      await milestonePage.setViewportSize({ width, height: 1000 });
      await milestonePage
        .getByRole('button', { name: 'Search workspace', exact: true })
        .click();
      assert.equal(
        await milestonePage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        'Command bar overflow at ' + width,
      );
      await milestonePage.keyboard.press('Escape');
    }
    await milestonePage.close();
    console.log(
      'PASS: milestones, completion, health explanations, persistence, command navigation/search, Escape, and mobile layouts.',
    );

    const notebookPage = await browser.newPage({
      viewport: { width: 320, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    notebookPage.on('pageerror', (error) => errors.push(error.message));
    await notebookPage.goto(origin + '/app.html?demo=1');
    await notebookPage.getByRole('button', { name: 'Projects', exact: true }).click();
    await notebookPage.getByRole('button', { name: 'New project', exact: true }).click();
    await notebookPage
      .getByLabel('Project name', { exact: true })
      .fill('Notebook launch');
    await notebookPage.getByRole('button', { name: 'Save project', exact: true }).click();
    await notebookPage
      .getByRole('button', { name: 'Open notebook for Notebook launch', exact: true })
      .click();
    await notebookPage.getByRole('button', { name: 'Add entry', exact: true }).click();
    await notebookPage.getByLabel('Entry type', { exact: true }).selectOption('decision');
    await notebookPage
      .getByLabel('Entry title', { exact: true })
      .fill('Choose deployment');
    await notebookPage
      .getByLabel('Entry content', { exact: true })
      .fill('<img src=x onerror=alert(1)> remains plain text');
    await notebookPage.getByRole('button', { name: 'Save entry', exact: true }).click();
    await notebookPage
      .getByRole('heading', { name: 'Choose deployment', exact: true })
      .waitFor();
    assert.equal(await notebookPage.locator('.notebook-entries img').count(), 0);
    await notebookPage.getByRole('button', { name: 'Add entry', exact: true }).click();
    await notebookPage.getByLabel('Entry type', { exact: true }).selectOption('meeting');
    await notebookPage.getByLabel('Entry title', { exact: true }).fill('Release review');
    await notebookPage
      .getByLabel('Entry content', { exact: true })
      .fill('Review accessibility and confirm the release checklist.');
    await notebookPage.getByRole('button', { name: 'Save entry', exact: true }).click();
    await notebookPage
      .getByRole('heading', { name: 'Release review', exact: true })
      .waitFor();
    await notebookPage
      .getByLabel('Notebook entry type', { exact: true })
      .selectOption('decision');
    await notebookPage
      .getByRole('heading', { name: 'Release review', exact: true })
      .waitFor({ state: 'hidden' });
    await notebookPage
      .getByRole('heading', { name: 'Choose deployment', exact: true })
      .waitFor();
    await notebookPage
      .getByRole('button', { name: 'Edit entry Choose deployment', exact: true })
      .click();
    await notebookPage
      .getByLabel('Entry content', { exact: true })
      .fill('Choose a provider after reviewing deployment costs.');
    await notebookPage.getByRole('button', { name: 'Save entry', exact: true }).click();
    await notebookPage
      .getByText('Choose a provider after reviewing deployment costs.', { exact: true })
      .waitFor();
    for (const width of [320, 375, 768, 1024, 1440]) {
      await notebookPage.setViewportSize({ width, height: 1000 });
      assert.equal(
        await notebookPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        'Notebook overflow at ' + width,
      );
    }
    await notebookPage.screenshot({
      path: 'docs/screenshots/notebook-desktop.png',
      fullPage: true,
    });
    await notebookPage
      .getByRole('button', { name: 'Close project notebook', exact: true })
      .click();
    await notebookPage.reload();
    await notebookPage.getByRole('button', { name: 'Projects', exact: true }).click();
    await notebookPage
      .getByRole('button', { name: 'Open notebook for Notebook launch', exact: true })
      .click();
    await notebookPage
      .getByRole('heading', { name: 'Release review', exact: true })
      .waitFor();
    await notebookPage
      .getByRole('button', { name: 'Create follow-up task', exact: true })
      .click();
    assert.equal(
      await notebookPage.getByLabel('Task title', { exact: true }).inputValue(),
      'Follow up: Release review',
    );
    assert.equal(
      await notebookPage.getByLabel('Project', { exact: true }).inputValue(),
      'Notebook launch',
    );
    await notebookPage.getByRole('button', { name: 'Save task', exact: true }).click();
    await notebookPage
      .getByRole('button', { name: 'Open tasks for Notebook launch', exact: true })
      .click();
    await notebookPage
      .getByRole('heading', { name: 'Follow up: Release review', exact: true })
      .waitFor();
    await notebookPage.getByRole('button', { name: 'Projects', exact: true }).click();
    await notebookPage
      .getByRole('button', { name: 'Open notebook for Notebook launch', exact: true })
      .click();
    notebookPage.once('dialog', (dialog) => dialog.dismiss());
    await notebookPage
      .getByRole('button', { name: 'Delete entry Choose deployment', exact: true })
      .click();
    await notebookPage
      .getByRole('heading', { name: 'Choose deployment', exact: true })
      .waitFor();
    notebookPage.once('dialog', (dialog) => dialog.accept());
    await notebookPage
      .getByRole('button', { name: 'Delete entry Choose deployment', exact: true })
      .click();
    await notebookPage
      .getByRole('heading', { name: 'Choose deployment', exact: true })
      .waitFor({ state: 'hidden' });
    await notebookPage.keyboard.press('Escape');
    await notebookPage.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(
      await notebookPage
        .getByRole('button', { name: 'Open notebook for Notebook launch', exact: true })
        .evaluate((element) => element === document.activeElement),
      true,
    );
    await notebookPage.close();
    console.log(
      'PASS: project notebook, decisions, meetings, editing, filters, persistence, follow-up tasks, deletion confirmation and responsive layout.',
    );

    const timePage = await browser.newPage({
      viewport: { width: 320, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    timePage.on('pageerror', (error) => errors.push(error.message));
    await timePage.goto(origin + '/app.html?demo=1');
    await timePage.getByRole('button', { name: 'Work log', exact: true }).click();
    await timePage
      .getByRole('heading', { name: 'Your weekly work log', exact: true })
      .waitFor();
    await timePage.getByRole('button', { name: 'Record time', exact: true }).click();
    await timePage.keyboard.press('Control+k');
    assert.equal(
      await timePage
        .getByRole('dialog', { name: 'Find your next step', exact: true })
        .count(),
      0,
    );
    await timePage.getByLabel('Work activity', { exact: true }).fill('Research launch');
    await timePage.getByLabel('Work project', { exact: true }).fill('Launch');
    await timePage.getByLabel('Work date', { exact: true }).fill('2026-12-29');
    await timePage.getByLabel('Minutes worked', { exact: true }).fill('1.5');
    await timePage.getByRole('button', { name: 'Save work log', exact: true }).click();
    assert.ok(
      await timePage
        .getByRole('dialog', { name: 'Record your work', exact: true })
        .isVisible(),
    );
    await timePage.getByLabel('Minutes worked', { exact: true }).fill('120');
    await timePage
      .getByLabel('Work notes', { exact: true })
      .fill('<img src=x onerror=alert(1)> plain work notes');
    await timePage.getByRole('button', { name: 'Save work log', exact: true }).click();
    await timePage
      .getByRole('heading', { name: 'Research launch', exact: true })
      .waitFor();
    assert.equal(await timePage.locator('.work-log-list img').count(), 0);
    await timePage
      .getByRole('button', { name: 'Edit work log Research launch', exact: true })
      .click();
    await timePage
      .getByLabel('Work notes', { exact: true })
      .fill('Reviewed the research plan and prepared the launch checklist.');
    await timePage.getByRole('button', { name: 'Save work log', exact: true }).click();
    await timePage
      .getByText('Reviewed the research plan and prepared the launch checklist.', {
        exact: true,
      })
      .waitFor();
    await timePage.getByRole('button', { name: 'Record time', exact: true }).click();
    await timePage.getByLabel('Work activity', { exact: true }).fill('Review notes');
    await timePage.getByLabel('Work project', { exact: true }).fill('Research');
    await timePage.getByLabel('Minutes worked', { exact: true }).fill('30');
    await timePage.getByRole('button', { name: 'Save work log', exact: true }).click();
    await timePage.getByRole('heading', { name: 'Review notes', exact: true }).waitFor();
    await timePage
      .locator('.time-summary article')
      .getByText('2h 30m', { exact: true })
      .waitFor();
    await timePage
      .getByRole('button', { name: 'Edit work log Review notes', exact: true })
      .click();
    await timePage.getByLabel('Minutes worked', { exact: true }).fill('45');
    await timePage.getByRole('button', { name: 'Save work log', exact: true }).click();
    await timePage
      .locator('.time-summary article')
      .getByText('2h 45m', { exact: true })
      .waitFor();
    await timePage
      .getByLabel('Work log project filter', { exact: true })
      .selectOption('Launch');
    await timePage
      .getByRole('heading', { name: 'Review notes', exact: true })
      .waitFor({ state: 'hidden' });
    await timePage
      .locator('.time-summary article')
      .getByText('2h', { exact: true })
      .waitFor();
    await timePage
      .getByLabel('Work log project filter', { exact: true })
      .selectOption('');
    await timePage.getByRole('heading', { name: 'Review notes', exact: true }).waitFor();
    await timePage.getByLabel('Week containing', { exact: true }).fill('2027-01-05');
    await timePage
      .getByRole('heading', { name: 'No work logs in this week', exact: true })
      .waitFor();
    await timePage.getByLabel('Week containing', { exact: true }).fill('2026-12-29');
    await timePage.getByRole('heading', { name: 'Review notes', exact: true }).waitFor();
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await timePage.setViewportSize({ width, height: 1000 });
      assert.equal(
        await timePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        'Timesheet overflow at ' + width,
      );
    }
    await timePage.screenshot({
      path: 'docs/screenshots/work-log-desktop.png',
      fullPage: true,
    });
    await timePage.reload();
    await timePage.getByRole('button', { name: 'Work log', exact: true }).click();
    await timePage.getByLabel('Week containing', { exact: true }).fill('2026-12-29');
    await timePage.getByRole('heading', { name: 'Review notes', exact: true }).waitFor();
    timePage.once('dialog', (dialog) => dialog.dismiss());
    await timePage
      .getByRole('button', { name: 'Delete work log Review notes', exact: true })
      .click();
    await timePage.getByRole('heading', { name: 'Review notes', exact: true }).waitFor();
    timePage.once('dialog', (dialog) => dialog.accept());
    await timePage
      .getByRole('button', { name: 'Delete work log Review notes', exact: true })
      .click();
    await timePage
      .getByRole('heading', { name: 'Review notes', exact: true })
      .waitFor({ state: 'hidden' });
    await timePage.close();
    if (!demoOnly) {
      await page.getByRole('button', { name: 'Work log', exact: true }).click();
      await page.getByRole('button', { name: 'Record time', exact: true }).click();
      await page
        .getByLabel('Work activity', { exact: true })
        .fill('Account work session');
      await page.getByLabel('Work project', { exact: true }).fill('Account launch');
      await page.getByLabel('Work date', { exact: true }).fill('2026-12-29');
      await page.getByLabel('Minutes worked', { exact: true }).fill('90');
      await page.getByRole('button', { name: 'Save work log', exact: true }).click();
      await page
        .getByRole('heading', { name: 'Account work session', exact: true })
        .waitFor();
      await page.reload();
      await page.getByRole('button', { name: 'Work log', exact: true }).click();
      await page.getByLabel('Week containing', { exact: true }).fill('2026-12-29');
      await page
        .getByRole('heading', { name: 'Account work session', exact: true })
        .waitFor();
      await page
        .locator('.time-summary article')
        .getByText('1h 30m', { exact: true })
        .waitFor();
    }
    console.log(
      'PASS: manual time entry, integer validation, weekly boundaries, totals, project filters, editing, deletion, persistence, and mobile layouts.',
    );

    const referencePage = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    referencePage.on('pageerror', (error) => errors.push(error.message));
    await referencePage.goto(origin + '/app.html?demo=1');
    await referencePage.getByRole('button', { name: 'Projects', exact: true }).click();
    await referencePage
      .getByRole('button', {
        name: 'Add project details for Website launch',
        exact: true,
      })
      .click();
    await referencePage
      .getByRole('button', { name: 'Save project', exact: true })
      .click();
    assert.equal(
      await referencePage.evaluate(
        () =>
          JSON.parse(localStorage.getItem('orbit.tasks.v1') ?? '[]').filter(
            (task) => task.project === 'Website launch' && task.projectId,
          ).length,
      ),
      0,
    );
    await referencePage
      .getByRole('button', {
        name: 'Connect existing tasks for Website launch',
        exact: true,
      })
      .click();
    await referencePage
      .getByRole('status')
      .filter({ hasText: '3 existing tasks connected' })
      .waitFor();
    assert.equal(
      await referencePage.evaluate(() => {
        const records = JSON.parse(localStorage.getItem('orbit.projects.v1'));
        const id = records.find((project) => project.name === 'Website launch').id;
        return JSON.parse(localStorage.getItem('orbit.tasks.v1') ?? '[]')
          .filter((task) => task.project === 'Website launch')
          .every((task) => task.projectId === id);
      }),
      true,
    );
    await referencePage
      .getByRole('button', {
        name: 'Connect existing tasks for Website launch',
        exact: true,
      })
      .click();
    await referencePage
      .getByRole('status')
      .filter({ hasText: '0 existing tasks connected' })
      .waitFor();
    await referencePage.getByRole('button', { name: 'Task board', exact: true }).click();
    await referencePage.getByRole('button', { name: 'New task', exact: true }).click();
    await referencePage.getByLabel('Task title', { exact: true }).fill('Stable new task');
    await referencePage.getByLabel('Project', { exact: true }).fill('New stable project');
    await referencePage.getByRole('button', { name: 'Save task', exact: true }).click();
    await referencePage
      .getByRole('heading', { name: 'Stable new task', exact: true })
      .waitFor();
    assert.equal(
      await referencePage.evaluate(() => {
        const task = JSON.parse(localStorage.getItem('orbit.tasks.v1') ?? '[]').find(
          (task) => task.title === 'Stable new task',
        );
        return (
          task.projectId ===
          JSON.parse(localStorage.getItem('orbit.projects.v1')).find(
            (project) => project.name === task.project,
          ).id
        );
      }),
      true,
    );
    await referencePage.close();
    console.log(
      'PASS: explicit legacy linking, repeatable connection, and automatic stable references for new tasks.',
    );

    const timelinePage = await browser.newPage({
      viewport: { width: 320, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    timelinePage.on('pageerror', (error) => errors.push(error.message));
    await timelinePage.goto(origin + '/app.html?demo=1');
    await timelinePage.getByRole('button', { name: 'Projects', exact: true }).click();
    await timelinePage
      .getByRole('button', {
        name: 'Add project details for Website launch',
        exact: true,
      })
      .click();
    await timelinePage
      .getByLabel('Project start date', { exact: true })
      .fill('2026-10-10');
    await timelinePage
      .getByLabel('Project target date', { exact: true })
      .fill('2026-10-30');
    await timelinePage.getByRole('button', { name: 'Save project', exact: true }).click();
    await timelinePage
      .getByRole('button', { name: 'Project timeline', exact: true })
      .click();
    await timelinePage.getByLabel('Timeline month', { exact: true }).fill('2026-10');
    assert.equal(await timelinePage.locator('.timeline-bar').count(), 1);
    await timelinePage.getByLabel('Timeline month', { exact: true }).fill('2026-11');
    assert.equal(await timelinePage.locator('.timeline-bar').count(), 0);
    await timelinePage.getByText('Outside this month', { exact: true }).waitFor();
    await timelinePage.getByLabel('Timeline month', { exact: true }).fill('2026-10');
    for (const width of [320, 375, 768, 1024, 1440]) {
      await timelinePage.setViewportSize({ width, height: 1000 });
      assert.equal(
        await timelinePage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        'Project timeline overflow at ' + width,
      );
    }
    await timelinePage.screenshot({
      path: 'docs/screenshots/timeline-desktop.png',
      fullPage: true,
    });
    await timelinePage
      .getByRole('button', { name: 'Open tasks for Website launch', exact: true })
      .click();
    await timelinePage
      .getByRole('heading', { name: 'Build the homepage', exact: true })
      .waitFor();
    assert.equal(
      await timelinePage.getByLabel('Filter by project', { exact: true }).inputValue(),
      'Website launch',
    );
    await timelinePage.close();
    console.log(
      'PASS: recorded project timeline, date clipping, mobile layout and task navigation.',
    );
  }
  if (!demoOnly) {
    if (mongoose.connection.readyState !== 1)
      await mongoose.connect(process.env.MONGODB_URI);
    const { RateBucket } = await import('../server/models/RateBucket.js');
    await RateBucket.deleteMany({ key: /^(api|auth):/ });
    const ownerContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const memberContext = await browser.newContext({
      viewport: { width: 375, height: 900 },
    });
    const ownerPage = await ownerContext.newPage(),
      memberPage = await memberContext.newPage();
    for (const current of [ownerPage, memberPage]) {
      current.on('response', (response) => {
        if (response.status() === 429)
          console.log('Team test rate limit: ' + new URL(response.url()).pathname);
      });
      current.setDefaultTimeout(15000);
      current.on('pageerror', (error) => errors.push(error.message));
    }
    for (const [context, name, email] of [
      [ownerContext, 'Iris', 'iris-browser@example.com'],
      [memberContext, 'Omar', 'omar-browser@example.com'],
    ]) {
      const response = await context.request.post(origin + '/api/auth/register', {
        headers: { Origin: origin },
        data: { name, email, password: 'browser-team-passphrase-long' },
      });
      assert.equal(response.status(), 201);
    }
    const projectResponse = await ownerContext.request.post(origin + '/api/projects', {
      headers: { Origin: origin },
      data: {
        name: 'Community workshop',
        description: 'Plan a useful workshop, with a clear next step for everyone.',
      },
    });
    assert.equal(projectResponse.status(), 201);
    const teamProject = (await projectResponse.json()).project;
    await ownerContext.request.post(origin + '/api/tasks', {
      headers: { Origin: origin },
      data: {
        title: 'Prepare the workshop outline',
        project: teamProject.name,
        description: 'Choose three practical topics and share the draft for review.',
      },
    });
    await ownerPage.goto(origin + '/app.html');
    await ownerPage.getByRole('button', { name: 'Team projects', exact: true }).click();
    await ownerPage
      .getByLabel('Choose a project', { exact: true })
      .selectOption(teamProject.id);
    await ownerPage
      .getByLabel('Teammate’s account email', { exact: true })
      .fill('omar-browser@example.com');
    await ownerPage.getByRole('button', { name: 'Invite teammate', exact: true }).click();
    await ownerPage
      .getByRole('button', { name: 'Cancel invitation', exact: true })
      .waitFor();
    await memberPage.goto(origin + '/app.html');
    await memberPage.getByRole('button', { name: 'Team projects', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Accept', exact: true }).click();
    await memberPage
      .getByLabel('Choose a project', { exact: true })
      .selectOption(teamProject.id);
    await memberPage
      .getByRole('heading', { name: 'Prepare the workshop outline', exact: true })
      .waitFor();
    assert.equal(
      await memberPage
        .getByRole('button', { name: 'Invite teammate', exact: true })
        .count(),
      0,
    );
    const memberId = (
      await memberContext.request
        .get(origin + '/api/auth/me')
        .then((response) => response.json())
    ).user.id;
    await memberPage
      .getByLabel('Assignee for Prepare the workshop outline', { exact: true })
      .selectOption(memberId);
    await memberPage.getByText('Task assignment saved.', { exact: true }).waitFor();
    await memberPage.getByLabel('Only tasks assigned to me', { exact: true }).check();
    await memberPage
      .getByRole('heading', { name: 'Prepare the workshop outline', exact: true })
      .waitFor();
    await memberPage.getByLabel('Only tasks assigned to me', { exact: true }).uncheck();
    await memberPage.getByRole('button', { name: 'Discussion', exact: true }).click();
    await memberPage
      .getByLabel('New comment', { exact: true })
      .fill('I will share the outline before our next meeting.');
    await memberPage.getByRole('button', { name: 'Add comment', exact: true }).click();
    await memberPage
      .getByText('I will share the outline before our next meeting.', { exact: true })
      .waitFor();
    await memberPage
      .getByRole('button', { name: 'Close discussion', exact: true })
      .click();
    await memberPage
      .getByRole('button', { name: 'New shared task', exact: true })
      .click();
    assert.equal(
      await memberPage.getByLabel('Project', { exact: true }).getAttribute('readonly'),
      '',
    );
    await memberPage
      .getByLabel('Task title', { exact: true })
      .fill('Reserve the meeting room');
    await memberPage.getByRole('button', { name: 'Save task', exact: true }).click();
    await memberPage
      .getByRole('heading', { name: 'Reserve the meeting room', exact: true })
      .waitFor();
    // Both test accounts share one loopback IP and run faster than human interaction.
    // Rate-limit behavior is covered separately; start a fresh bucket for the next scenario.
    await RateBucket.deleteMany({ key: /^api:/ });
    await memberPage.reload();
    await memberPage.getByRole('button', { name: 'Team projects', exact: true }).click();
    await memberPage
      .getByLabel('Choose a project', { exact: true })
      .selectOption(teamProject.id);
    assert.equal(
      await memberPage
        .getByLabel('Assignee for Prepare the workshop outline', { exact: true })
        .inputValue(),
      memberId,
    );

    await ownerPage.getByRole('button', { name: 'Workflow', exact: true }).click();
    await ownerPage
      .getByLabel('Project template', { exact: true })
      .selectOption('workshop-v1');
    ownerPage.once('dialog', (dialog) => dialog.accept());
    await ownerPage
      .getByRole('button', { name: 'Apply project template', exact: true })
      .click();
    await ownerPage
      .getByText('Project starter tasks are ready. Open Shared tasks to adapt them.', {
        exact: true,
      })
      .waitFor();
    await ownerPage.getByText('Project template applied.', { exact: true }).waitFor();
    await ownerPage.getByRole('button', { name: 'Shared tasks', exact: true }).click();
    await ownerPage
      .getByRole('heading', { name: 'Define the workshop outcome', exact: true })
      .waitFor();
    await RateBucket.deleteMany({ key: /^api:/ });
    await memberPage.getByRole('button', { name: 'Goals', exact: true }).click();
    await memberPage.getByRole('button', { name: 'New objective', exact: true }).click();
    await memberPage
      .getByLabel('Objective', { exact: true })
      .fill('Welcome 10 participants');
    await memberPage
      .getByLabel('Result title 1', { exact: true })
      .fill('Confirm attendance');
    await memberPage.getByLabel('current result 1', { exact: true }).fill('4');
    await memberPage.getByLabel('target result 1', { exact: true }).fill('10');
    await memberPage.getByRole('button', { name: 'Save objective', exact: true }).click();
    await memberPage.getByText('Objective saved.', { exact: true }).waitFor();
    await memberPage.getByText('Due: Not set · 40% progress', { exact: true }).waitFor();
    await memberPage
      .getByRole('button', { name: 'Refresh objectives', exact: true })
      .click();
    await memberPage
      .getByRole('heading', { name: 'Welcome 10 participants', exact: true })
      .waitFor();
    await memberPage.getByRole('button', { name: 'Workload', exact: true }).click();
    await memberPage
      .getByRole('heading', { name: 'Plan a manageable week', exact: true })
      .waitFor();
    await memberPage.getByLabel('Capacity for Omar', { exact: true }).fill('240');
    await memberPage.getByRole('button', { name: 'Save capacity', exact: true }).click();
    await memberPage
      .getByText('Capacity saved for this project and week.', { exact: true })
      .waitFor();
    await memberPage
      .getByRole('button', { name: 'Refresh workload', exact: true })
      .click();
    assert.equal(
      await memberPage.getByLabel('Capacity for Omar', { exact: true }).inputValue(),
      '240',
    );
    await memberPage.getByRole('button', { name: 'Dependencies', exact: true }).click();
    await memberPage
      .getByLabel('Finish this first', { exact: true })
      .selectOption({ label: 'Prepare the workshop outline' });
    await memberPage
      .getByLabel('Before starting this', { exact: true })
      .selectOption({ label: 'Reserve the meeting room' });
    await memberPage.getByRole('button', { name: 'Add dependency', exact: true }).click();
    await memberPage.getByText('Dependency added.', { exact: true }).waitFor();
    await memberPage
      .getByText('Waiting for prerequisite completion', { exact: true })
      .waitFor();
    await memberPage
      .getByLabel('Finish this first', { exact: true })
      .selectOption({ label: 'Reserve the meeting room' });
    await memberPage
      .getByLabel('Before starting this', { exact: true })
      .selectOption({ label: 'Prepare the workshop outline' });
    await memberPage.getByRole('button', { name: 'Add dependency', exact: true }).click();
    await memberPage
      .getByText('This dependency would create a circular chain.', { exact: true })
      .waitFor();
    await memberPage
      .getByRole('button', { name: 'Refresh dependencies', exact: true })
      .click();
    await memberPage
      .getByText('This dependency would create a circular chain.', { exact: true })
      .waitFor({ state: 'hidden' });
    await memberPage.getByLabel('Finish this first', { exact: true }).selectOption('');
    await memberPage.getByLabel('Before starting this', { exact: true }).selectOption('');
    for (const width of [320, 375, 768, 1024, 1440]) {
      await memberPage.setViewportSize({ width, height: 1000 });
      assert.equal(
        await memberPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        'Team overflow at ' + width,
      );
    }

    for (const [tab, heading] of [
      ['Shared tasks', 'Shared project tasks'],
      ['Dependencies', 'What needs to happen first?'],
      ['Workload', 'Plan a manageable week'],
      ['Goals', 'Connect work to a clear outcome'],
      ['Workflow', 'Give this project a useful starting point'],
      ['Reviews', 'Review requests'],
      ['Work requests', 'Propose a next step'],
    ]) {
      await memberPage.getByRole('button', { name: tab, exact: true }).click();
      await memberPage.getByRole('heading', { name: heading, exact: true }).waitFor();
      for (const width of [320, 375, 768, 1024, 1440]) {
        await memberPage.setViewportSize({ width, height: 1000 });
        assert.equal(
          await memberPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          tab + ' overflow at ' + width,
        );
      }
    }
    await memberPage.getByRole('button', { name: 'Shared tasks', exact: true }).click();
    await memberPage.evaluate(() => {
      window.scrollTo(0, 0);
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.scrollTop = 0;
    });
    await memberPage.screenshot({
      path: 'docs/screenshots/team-desktop.png',
      fullPage: true,
    });
    await memberPage.setViewportSize({ width: 375, height: 900 });
    await memberPage.evaluate(() => window.scrollTo(0, 0));
    await memberPage.screenshot({
      path: 'docs/screenshots/team-mobile.png',
      fullPage: true,
    });

    await memberPage.getByRole('button', { name: 'Reviews', exact: true }).click();
    await memberPage
      .getByLabel('Task to review', { exact: true })
      .selectOption({ label: 'Prepare the workshop outline' });
    await memberPage
      .getByLabel('Reviewer', { exact: true })
      .selectOption({ label: 'Iris · Owner' });
    await memberPage
      .getByLabel('What should they check?', { exact: true })
      .fill('Check that the topics are practical.');
    await memberPage.getByRole('button', { name: 'Request review', exact: true }).click();
    await memberPage.getByText('Review requested.', { exact: true }).waitFor();
    await ownerPage.getByRole('button', { name: 'Reviews', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Refresh reviews', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Approve', exact: true }).click();
    await ownerPage.getByText('Review decision saved.', { exact: true }).waitFor();
    await memberPage
      .getByLabel('Review status', { exact: true })
      .selectOption('approved');
    await memberPage.getByText('Omar → Iris · approved', { exact: true }).waitFor();

    await RateBucket.deleteMany({ key: /^api:/ });
    await memberPage.getByRole('button', { name: 'Work requests', exact: true }).click();
    await memberPage
      .getByLabel('Request title', { exact: true })
      .fill('Prepare participant handouts');
    await memberPage
      .getByLabel('Request details', { exact: true })
      .fill('Include the three workshop topics and a short checklist.');
    await memberPage
      .getByRole('button', { name: 'Submit work request', exact: true })
      .click();
    await memberPage.getByText('Work request submitted.', { exact: true }).waitFor();
    assert.equal(
      await memberPage
        .getByRole('button', { name: 'Accept into board', exact: true })
        .count(),
      0,
    );
    await ownerPage.getByRole('button', { name: 'Work requests', exact: true }).click();
    await ownerPage
      .getByRole('button', { name: 'Accept into board', exact: true })
      .click();
    await ownerPage
      .getByRole('heading', { name: 'Prepare participant handouts', exact: true })
      .waitFor();
    await memberPage.getByRole('button', { name: 'Shared tasks', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Refresh', exact: true }).click();
    await memberPage
      .getByRole('heading', { name: 'Prepare participant handouts', exact: true })
      .waitFor();
    await ownerPage.getByRole('button', { name: 'Refresh', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Remove access', exact: true }).waitFor();
    ownerPage.once('dialog', (dialog) => dialog.accept());
    await ownerPage.getByRole('button', { name: 'Remove access', exact: true }).click();
    await ownerPage.getByText('Project access removed.', { exact: true }).waitFor();
    await memberPage.getByRole('button', { name: 'Refresh', exact: true }).click();
    await memberPage
      .getByText('Project access changed. Choose an available project.', { exact: true })
      .waitFor();
    assert.equal(
      await memberPage
        .getByRole('heading', { name: 'Reserve the meeting room', exact: true })
        .count(),
      0,
    );

    await RateBucket.deleteMany({ key: /^api:/ });
    await ownerPage.getByLabel('Invitation role', { exact: true }).selectOption('guest');
    await ownerPage
      .getByLabel('Teammate’s account email', { exact: true })
      .fill('omar-browser@example.com');
    await ownerPage.getByRole('button', { name: 'Invite teammate', exact: true }).click();
    await ownerPage
      .getByRole('button', { name: 'Cancel invitation', exact: true })
      .waitFor();
    await memberPage.getByRole('button', { name: 'Refresh', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Accept', exact: true }).click();
    await memberPage
      .getByLabel('Choose a project', { exact: true })
      .selectOption(teamProject.id);
    await memberPage
      .getByRole('heading', { name: 'Guest project portal', exact: true })
      .waitFor();
    await memberPage
      .getByRole('heading', { name: 'Prepare participant handouts', exact: true })
      .waitFor();
    assert.equal(
      await memberPage
        .getByRole('button', { name: 'New shared task', exact: true })
        .count(),
      0,
    );
    assert.equal(
      await memberPage
        .getByRole('navigation', { name: 'Project tools', exact: true })
        .count(),
      0,
    );
    assert.equal(
      (
        await memberContext.request.get(
          origin + '/api/projects/' + teamProject.id + '/tasks',
        )
      ).status(),
      404,
    );
    for (const width of [320, 375, 768, 1024, 1440]) {
      await memberPage.setViewportSize({ width, height: 1000 });
      assert.equal(
        await memberPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        'Guest portal overflow at ' + width,
      );
    }
    await memberPage.evaluate(() => window.scrollTo(0, 0));
    await memberPage.screenshot({
      path: 'docs/screenshots/guest-desktop.png',
      fullPage: true,
    });
    console.log(
      'PASS: guest invitation, read-only portal, restricted team access and mobile layouts.',
    );
    await ownerContext.close();
    await memberContext.close();
    console.log(
      'PASS: team invite/accept, shared task creation, assignment, discussion, persistence, revocation, and responsive layout.',
    );
  }
  assert.deepEqual(errors, []);

  console.log('PASS: no uncaught browser errors.');
} catch (failure) {
  // Publish actionable CI diagnostics without needing authenticated log downloads.
  const message = failure.message
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  console.error('::error title=Browser regression::' + message);
  throw failure;
} finally {
  await browser?.close();
  await vite?.close();
  if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
}
