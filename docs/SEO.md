# SEO launch checklist

Orbit’s public landing and privacy pages are static HTML. The React workspace is marked noindex; authentication protects account data.

## Implemented

- Distinct public titles and descriptions, semantic landmarks, and crawlable anchor links.
- Responsive layouts with the same essential public information on mobile.
- Filters and search do not generate public URL combinations.
- No invented testimonials, ratings, contact information, or keyword stuffing.
- A lightweight vector icon with no external font dependency.
- The build generates canonical URLs, Open Graph URLs, WebSite structured data, sitemap.xml, and a robots sitemap reference when SITE_URL is configured.
- Only the landing page and privacy page enter the sitemap. No fake lastmod dates.
- Production metadata includes an original 1200×630 social preview and SoftwareApplication data without invented reviews or ratings.
- Preview builds mark public pages noindex and omit the production sitemap.

## Production configuration

Set SITE_URL to the clean HTTPS production origin, without a subpath, query, or fragment. Example: https://your-project.vercel.app. The same origin should match APP_ORIGIN, internal navigation, and hosting redirects.

Without SITE_URL, the build intentionally omits domain-dependent metadata and the sitemap. Never submit a sitemap generated with an example domain.

## Checks after deployment

The canonical origin is **https://orbit-by-sheheryar.vercel.app**. Public pages, sitemap, robots, anonymous API denial and security headers were checked on October 11, 2026. Search Console verification is still an owner-account step.

1. Add `https://orbit-by-sheheryar.vercel.app/` as a **URL-prefix property** in [Google Search Console](https://search.google.com/search-console).
2. Select HTML-tag verification. Copy only its `content` token into Vercel's optional `GOOGLE_SITE_VERIFICATION` build variable, then redeploy. The build emits the verification meta tag on public pages.
3. Verify the property, submit `sitemap.xml`, and request indexing of the home page through URL Inspection.
4. Monitor indexing and the chosen canonical. Search terms such as **Orbit project management** or **Orbit by Sheheryar** describe this app more clearly than the broad word **Orbit**. No code change guarantees indexing or first position.

- Public canonical pages return 200; nonexistent paths return 404.
- The selected HTTPS hostname is consistent across redirects, canonicals, sitemap, and social metadata.
- Verify robots directives in source and rendered content.
- Confirm private task and account responses are not cached or publicly exposed.
- Inspect structured data and the actual generated sitemap.
- Inspect the deployed social preview image and Open Graph/Twitter image metadata.
- Verify preview deployments stay outside the public index.
- Submit the sitemap and inspect Google’s selected canonical in Search Console.
- Measure mobile Lighthouse and real-user Core Web Vitals once traffic exists.
- Keep privacy statements accurate as data collection and account features change.
- Add a real support contact once the author provides it.

## Scope-dependent requirements

Breadcrumbs apply if the public hierarchy grows. Hreflang applies only to real translated pages. Large public collections may need pagination, duplicate-URL controls, and template audits. Server-log analysis requires access to production crawl logs.

The supplied SEO checklist is tracked here; inapplicable features should not be manufactured simply to add markup.

## Sources

- [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

The public landing page describes personal and team project management. Private workspace records remain behind authentication or local demo storage, and app.html remains noindex. Calendar handoffs are snapshots; do not advertise email delivery or live external synchronization as implemented.
