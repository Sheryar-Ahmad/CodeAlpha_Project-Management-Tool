import { readFile, writeFile } from 'node:fs/promises';

// Generate deployment-specific signals only when a real domain is provided.
const configured = process.env.SITE_URL;
if (configured) {
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
        url: origin + '/',
      });
      html = html.replace(
        '</head>',
        '<script type="application/ld+json">' + data + '</script></head>',
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
