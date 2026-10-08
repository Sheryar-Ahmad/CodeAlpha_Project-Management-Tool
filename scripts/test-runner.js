import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const env = { ...process.env, MONGOMS_DOWNLOAD_DIR: resolve(root, '.cache/mongodb') };
const binary = resolve(root, '.cache/mongo-server/mongod.exe');
if (!env.MONGOMS_SYSTEM_BINARY && existsSync(binary)) env.MONGOMS_SYSTEM_BINARY = binary;
if (process.argv[2] === 'browser') {
  env.PLAYWRIGHT_BROWSERS_PATH ??= resolve(root, '.cache/playwright');
}
const args =
  process.argv[2] === 'browser'
    ? ['scripts/browser-test.js', ...process.argv.slice(3)]
    : ['--test', '--test-concurrency=1', 'tests/api.test.js', 'tests/validation.test.js'];
const result = spawnSync(process.execPath, args, {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
