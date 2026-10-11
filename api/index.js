// Orbit | Copyright (c) 2026 Sheheryar Ahmad | See NOTICE.
import app from '../server/app.js';

export default function handler(req, res) {
  // Vercel forwards the rewrite's :path* capture as query metadata. Strip it
  // before Express reads the query so strict API schemas see only app filters.
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.has('path')) {
    url.searchParams.delete('path');
    req.url = `${url.pathname}${url.search}`;
  }
  // Vercel can also provide a pre-parsed query object on the incoming request.
  if (req.query && Object.hasOwn(req.query, 'path')) delete req.query.path;
  return app(req, res);
}
