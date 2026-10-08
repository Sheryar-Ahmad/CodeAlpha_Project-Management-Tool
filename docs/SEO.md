# SEO launch checklist

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

## Production configuration

Set SITE_URL to the clean HTTPS production origin, without a subpath, query, or fragment. Example: https://your-project.vercel.app. The same origin should match APP_ORIGIN, internal navigation, and hosting redirects.

Without SITE_URL, the build intentionally omits domain-dependent metadata and the sitemap. Never submit a sitemap generated with an example domain.

## Checks after deployment

- Public canonical pages return 200; nonexistent paths return 404.
- The selected HTTPS hostname is consistent across redirects, canonicals, sitemap, and social metadata.
- Verify robots directives in source and rendered content.
- Confirm private task and account responses are not cached or publicly exposed.
- Inspect structured data and the actual generated sitemap.
- Add a real social preview image and complete Open Graph/Twitter image metadata.
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
