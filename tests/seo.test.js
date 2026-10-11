import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function buildMetadata(env, check) {
  const cache = resolve('.cache');
  mkdirSync(cache, { recursive: true });
  const folder = mkdtempSync(resolve(cache, 'seo-test-'));
  mkdirSync(resolve(folder, 'dist'));
  for (const file of ['index.html', 'privacy.html'])
    writeFileSync(
      resolve(folder, 'dist', file),
      '<html><head><meta name="robots" content="index,follow"></head><body>Orbit</body></html>',
    );
  writeFileSync(resolve(folder, 'dist', 'sitemap.xml'), 'stale production sitemap');
  try {
    const result = spawnSync(process.execPath, [resolve('scripts/seo.js')], {
      cwd: folder,
      env: {
        ...process.env,
        SITE_URL: '',
        VERCEL_ENV: '',
        GOOGLE_SITE_VERIFICATION: '',
        ...env,
      },
      encoding: 'utf8',
      windowsHide: true,
    });
    check(
      result,
      (file) => readFileSync(resolve(folder, 'dist', file), 'utf8'),
      (file) => existsSync(resolve(folder, 'dist', file)),
    );
  } finally {
    if (!folder.startsWith(cache + '/') && !folder.startsWith(cache + '\\'))
      throw new Error('Unexpected test directory');
    rmSync(folder, { recursive: true, force: true });
  }
}
test('production search metadata uses the configured origin and real application identity', () => {
  buildMetadata(
    {
      SITE_URL: 'https://orbit-by-sheheryar.vercel.app',
      VERCEL_ENV: 'production',
      GOOGLE_SITE_VERIFICATION: 'test_token-123',
    },
    (result, read) => {
      assert.equal(result.status, 0);
      const html = read('index.html');
      assert.match(
        html,
        /rel="canonical" href="https:\/\/orbit-by-sheheryar.vercel.app\/"/,
      );
      assert.match(html, /google-site-verification" content="test_token-123"/);
      assert.match(html, /orbit-social.png/);
      assert.match(html, /SoftwareApplication/);
      assert.doesNotMatch(html, /aggregateRating|reviewCount/);
      assert.doesNotMatch(read('sitemap.xml'), /app.html/);
      assert.match(
        read('robots.txt'),
        /Sitemap: https:\/\/orbit-by-sheheryar.vercel.app\/sitemap.xml/,
      );
    },
  );
});
test('preview deployments cannot emit indexable public pages or the production sitemap', () => {
  buildMetadata(
    { SITE_URL: 'https://orbit-by-sheheryar.vercel.app', VERCEL_ENV: 'preview' },
    (result, read, exists) => {
      assert.equal(result.status, 0);
      for (const file of ['index.html', 'privacy.html']) {
        assert.match(read(file), /content="noindex,follow"/);
        assert.doesNotMatch(read(file), /content="index,follow"|rel="canonical"/);
      }
      assert.equal(exists('sitemap.xml'), false);
    },
  );
});
test('search metadata rejects noncanonical origins and injected verification markup', () => {
  for (const SITE_URL of [
    'http://orbit.example',
    'https://orbit.example/path',
    'https://orbit.example/?a=1',
  ])
    buildMetadata({ SITE_URL }, (result) => assert.notEqual(result.status, 0));
  buildMetadata(
    {
      SITE_URL: 'https://orbit.example',
      GOOGLE_SITE_VERIFICATION: '"><script>alert(1)</script>',
    },
    (result) => assert.notEqual(result.status, 0),
  );
});
