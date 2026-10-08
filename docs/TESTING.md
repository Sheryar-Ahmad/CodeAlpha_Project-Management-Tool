# Verification checklist

## Automated checks

- npm run test:unit: dates, field limits, injection rejection, partial updates, pagination, and password hashing.
- npm test: real temporary MongoDB tests for safe account responses, cookies, authorization, literal search, pagination, expiry, and logout.
- npm run test:browser: Chromium demo and database-backed account flows, screenshots, mobile overflow, and uncaught errors.
- npm run build: compile the multipage public site and React workspace.
- npm run format:check: consistent formatting.

Temporary databases and downloaded tools stay in the ignored project cache. Integration tests do not use production records.

## Manual task checks

- Create a task with every field. Refresh and confirm persistence.
- Edit all fields, then change only status and confirm other fields stay intact.
- Use yesterday as a due date: unfinished tasks show overdue; completed tasks do not.
- Search by title, project, and description. Try regex punctuation as literal text.
- Filter by project. Rename a project label and clear filters.
- Delete a task and cancel deletion.
- Submit whitespace-only title/project and invalid dates.
- Enter markup as a title: show it as text without executing it.
- Try long text, empty workspace, completed-only board, and multiple task pages.
- Confirm summary counts cover the whole account while columns cover the current page.
- Block browser storage: demo saves must fail visibly.
- Reset demo requires confirmation and does not alter account tasks.

## Account checks

- Register, refresh, sign out, and sign in.
- Wrong credentials give a generic error.
- A different account cannot read or modify the first account’s tasks.
- Expired cookies return to sign in.
- Turn off the API/database and confirm clear recovery feedback.
- Confirm account data does not enter local demo storage.

## Accessibility and layout

- Keyboard-only navigation, Escape to close a dialog, labels, and focus return.
- Inspect widths of 375, 768, and 1440 pixels, and 200% zoom.
- Verify contrast and reduced-motion preferences.
- Check console errors and missing assets.

## Deployment checks still required

- Atlas network access and database credentials.
- Vercel /api routing, Secure cookies, exact APP_ORIGIN, and security headers.
- Real 404 responses and public indexing directives.
- Sitemap, canonical host, structured data, Search Console, and measured performance.

- Demo exit appears in both the top bar and sidebar. Check both return to sign-in without deleting demo tasks; the top button must be visible on mobile without scrolling.
