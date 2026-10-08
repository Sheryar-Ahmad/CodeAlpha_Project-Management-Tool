# SEO launch checklist
The supplied SEO notes are a project checklist, not a reason to add irrelevant markup or fictitious trust claims.

## Implemented in the prototype
- Public pages have static, crawlable content and actual anchor links.
- Landing and privacy pages have distinct titles and descriptions.
- Semantic landmarks and responsive content support mobile use.
- Workspace uses noindex,follow; it remains crawlable so the directive can be read.
- Search and filters do not create parameter URL combinations.
- No fabricated ratings, testimonials, business contact information, or schema claims.
- Lightweight CSS, JavaScript, and a vector favicon; no external font dependency.

## Required once the production domain is known
- Add self-referencing absolute canonicals for the landing and privacy pages.
- Add sitemap.xml with only those canonical public URLs; omit app.html.
- Add the absolute sitemap location to robots.txt.
- Use lastmod only when actual meaningful edits can be established, or omit it.
- Add og:url, site-name WebSite structured data, and a real social preview image with dimensions.
- Confirm the same HTTPS hostname across links, sitemap, canonicals, and redirects.
- Protect staging from indexing separately from the production site.
- Verify 200 for public pages and 404 for nonexistent paths; avoid catch-all rewrites.
- Inspect titles, descriptions, rendered HTML, and indexing directives.
- Submit the sitemap to Google Search Console and inspect Google's selected canonical.
- Measure mobile Lighthouse and real-user Core Web Vitals once traffic exists.
- Add screenshots with truthful captions, useful alt text, explicit dimensions, and compression.
- Keep the privacy notice consistent with actual authentication, hosting, and data collection.
- Add a real contact method once supplied by the author.

## Requirements that depend on later scope
Breadcrumbs apply when public page hierarchy grows. Hreflang applies only to actual translated pages. Pagination and duplicate-URL controls apply to future public collections. Server-log analysis and template audits become useful as the deployed application grows. Private workspace content should remain outside the public index and must be protected by authorization, not robots directives.

## Sources
- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
