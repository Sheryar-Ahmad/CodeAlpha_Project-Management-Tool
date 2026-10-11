import { readFile, writeFile, rm } from 'node:fs/promises';

// Generate deployment-specific signals only when a real domain is provided.
const configured = process.env.SITE_URL;
if (process.env.VERCEL_ENV === 'preview') {
  for (const file of ['index.html', 'privacy.html']) {
    let html = await readFile('dist/' + file, 'utf8');
    html = html.replace(/<meta\s+name="robots"[^>]*>/g, '');
    html = html.replace(
      '</head>',
      '<meta name="robots" content="noindex,follow"></head>',
    );
    await writeFile('dist/' + file, html);
  }
  await writeFile('dist/robots.txt', 'User-agent: *\nAllow: /\n');
  await rm('dist/sitemap.xml', { force: true });
  console.log('Preview pages marked noindex; production sitemap omitted.');
} else if (configured) {
  const url = new URL(configured);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'SITE_URL must be a clean HTTPS origin, e.g. https://orbit.example.com',
    );
  }
  const origin = url.origin;
  const entries = [
    ['index.html', '/'],
    ['privacy.html', '/privacy.html'],
  ];
  for (const [file, path] of entries) {
    let html = await readFile('dist/' + file, 'utf8');
    const canonical = origin + path;
    html = html.replace(
      '</head>',
      '<link rel="canonical" href="' +
        canonical +
        '"><meta property="og:url" content="' +
        canonical +
        '"></head>',
    );
    if (file === 'index.html') {
      const data = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Orbit',
        alternateName: 'Orbit by Sheheryar Ahmad',
        description:
          'Personal and team project management with tasks, calendars and shared assignments.',
        url: origin + '/',
      });
      const application = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Orbit',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web browser',
        url: origin + '/',
        author: { '@type': 'Person', name: 'Sheheryar Ahmad' },
      });
      html = html.replace(
        '</head>',
        '<meta property="og:image" content="' +
          origin +
          '/orbit-social.png">' +
          '<meta property="og:image:width" content="1200">' +
          '<meta property="og:image:height" content="630">' +
          '<meta property="og:image:alt" content="Orbit — personal and team project management">' +
          '<meta name="twitter:title" content="Orbit — Personal &amp; Team Project Management">' +
          '<meta name="twitter:description" content="Tasks, calendars and team assignments in one clear workspace.">' +
          '<meta name="twitter:image" content="' +
          origin +
          '/orbit-social.png">' +
          '<script type="application/ld+json">' +
          data +
          '</script>' +
          '<script type="application/ld+json">' +
          application +
          '</script></head>',
      );
    }
    const verification = process.env.GOOGLE_SITE_VERIFICATION;
    if (verification) {
      if (!/^[a-zA-Z0-9_-]+$/.test(verification))
        throw new Error('Invalid Google site verification token.');
      html = html.replace(
        '</head>',
        '<meta name="google-site-verification" content="' + verification + '"></head>',
      );
    }
    await writeFile('dist/' + file, html);
  }
  const urls = entries
    .map(([, path]) => '<url><loc>' + origin + path + '</loc></url>')
    .join('');
  await writeFile(
    'dist/sitemap.xml',
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      urls +
      '</urlset>',
  );
  await writeFile(
    'dist/robots.txt',
    'User-agent: *\nAllow: /\nSitemap: ' + origin + '/sitemap.xml\n',
  );
  console.log('Production canonical URLs and sitemap generated.');
} else {
  console.log('SITE_URL is unset: domain-specific SEO signals omitted.');
}
