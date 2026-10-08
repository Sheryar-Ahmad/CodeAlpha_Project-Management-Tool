# Verification checklist

## Automated checks

- npm run test:unit: dates, field limits, injection rejection, partial updates, pagination, checklist constraints, planning boundaries, timer calculations, and password hashing.
- npm test: real temporary MongoDB tests for safe account responses, cookies, authorization, literal search, pagination, expiry, logout, planning queries, owner-scoped project summaries, and checklist persistence.
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
- Use 31 or more tasks. Move to the next page immediately after opening the board; it must stay on that page. Return with Previous. An unchanged or whitespace-only search must not reset navigation.
- Block browser storage: demo saves must fail visibly.
- Reset demo requires confirmation and does not alter account tasks.

## Blockers and task context

- Choose Blocked from a task card. The form must request a reason; whitespace-only reasons must fail.
- Save, refresh, and inspect Blockers and project counts. Undated blocked tasks must still appear.
- Move back to To do or In progress: the old reason must clear, and the task must leave Blockers.
- Save notes and HTTP/HTTPS resources, reopen the form, and search a unique word from the notes or blocker. Unsafe URL protocols and embedded credentials must be rejected.

## Planning, reuse, and focus

- Give four unfinished tasks dates of yesterday, today, tomorrow, and eight days ahead. Today includes the first two; Upcoming includes only tomorrow. Completed and undated tasks are excluded from both.
- Leave a tab open across midnight or return to it the next day. The calendar views must update without reloading.
- Add, edit, remove, and complete checklist steps. Refresh and confirm progress is saved. Empty text and duplicate step IDs must be rejected; the limit is 20.
- Completing all steps must not silently change task status.
- Duplicate a completed task with a date and completed steps. The new form must keep the content but start To do with no date and unchecked steps. Cancel must create nothing; save must keep the original intact.
- Confirm project totals, task completion percentage, overdue counts, and earliest unfinished deadlines. Completed/undated tasks must not provide that deadline.
- Open a project card: the task board must select its exact label. Test project search and pagination with many labels.
- Start, pause, resume, reset, and finish a focus session. Switch views and refresh while running: remaining time should reflect the original deadline.
- Check focus and break modes, blocked local storage, narrow mobile layout, and keyboard controls. No alarm or popup should interrupt work.
- Sign in with a second account: timer state must not carry across accounts. The demo has its own timer state.

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
- Confirm Today/Upcoming show unfinished-work columns, Focus keeps the timer free of task counters, and pagination appears only when needed.
- Try the empty-column Create a task action in a filtered project and a daily view: the form must preserve its project/date defaults.

Automated browser coverage verifies the primary flows above; exhaustive accessibility, multi-browser behavior, and large-account load checks still require review.

## Deployment checks still required

- Atlas network access and database credentials.
- Vercel /api routing, Secure cookies, exact APP_ORIGIN, and security headers.
- Real 404 responses and public indexing directives.
- Sitemap, canonical host, structured data, Search Console, and measured performance.

- Demo exit appears in both the top bar and sidebar. Check both return to sign-in without deleting demo tasks; the top button must be visible on mobile without scrolling.
