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

## Task templates

- In New task, preview each starter and apply it. The form stays editable and no task is created until Save task.
- Keep the current project/date when applying a template. Every use starts with fresh, unchecked steps.
- Type a title or add steps first: applying a template asks before replacing the title, description, and checklist. Dismiss must preserve the draft.
- Cancel must create nothing; save and refresh must retain edits. Existing task forms do not show the template picker.
- Check the picker, preview, and buttons on a narrow mobile screen and with a keyboard.

## List presentation

- Switch between Board view and List view. The same tasks, project filter, search, and selected page must remain.
- Edit, duplicate, change status, block/unblock, and check steps from the list. They use the same actions as the board.
- Try Today, Upcoming, and Blockers while in the list. Date views keep their server-side deadline order.
- Use a missing search and a project with no results: show a clear empty state. Check narrow mobile layouts and keyboard access to both view buttons.

## Archive and recovery

- Archive a task, including one that is blocked. It leaves active views/counts and remains in Archive with its original context and status.
- Return it to the board. Its dates, notes, links, blocker reason, and checklist progress must survive.
- Delete active and archived tasks: they move to Trash. Restore returns them to active work.
- Archived/trashed tasks cannot be edited; checklist controls are disabled. Duplicate is available for archived work.
- Permanent deletion appears only in Trash. Cancel confirmation preserves the task; confirm removes it. Check empty recovery views and refresh.
- Test with two accounts: neither can list, transition, or permanently delete the other's records.
- Existing demo/database records without lifecycle must still appear as active. No automatic Trash purge occurs.

## Task export

- Export with a project/search filter active. The file must still contain all owned active, archived, and trashed tasks.
- Open the JSON and confirm titles, context, checklist progress, lifecycle, and export version. No passwords, sessions, credentials, or another user's records may appear.
- Demo exports must be marked demo and account exports account. Test download permission failures and an unavailable account API.
- More than 1,000 account tasks must return a clear size error; exceeding five account requests per hour must show a rate-limit message.
- The file contains private task text; importing it is not implemented.

## Recurring tasks

- Repeating tasks require a date. Complete Daily/Weekly/Monthly tasks: the completed occurrence remains and the next task starts To do with unchecked, independent steps.
- January 31 should become February 28/29, then March 31. Saving an unchanged February date must retain that anchor.
- Refresh and repeat completion requests: only one successor exists. Intentionally permanently deleting that successor must not recreate it on another completion retry.
- Stop repetition on the active task. Archive/Trash must not generate tasks. Duplicate starts with repetition off.
- An overdue date advances by one interval, not to the present day. There is no scheduled background generation. Supported dates stop at the end of 2100.
- Verify account isolation and persistence, narrow screens, blocked storage, and API failures.

## Project details

- Open Projects → New project. Save a brief, optional start/target dates, and status. The record must remain visible before any tasks exist, with zero progress.
- Target dates before start and impossible dates must be rejected. Duplicate exact names must not create extra records.
- Add details to an existing task group: its tasks, totals, and progress must survive unchanged.
- Edit description/status, refresh, and confirm persistence. Names are fixed in this milestone; a partial API update must preserve omitted fields.
- View tasks from an empty project, add its first task, and return to Projects. The selected name and project statistics must agree.
- Use two accounts: one cannot list or edit the other's project details. Demo records must not enter account storage.
- Reset demo removes demo project details. Try corrupted/blocked storage and keyboard/Escape navigation. Check widths 320, 375, 768, 1024, and 1440 pixels.

## Expanded private workflows

- Calendar: select a month/day, create a dated task, edit its date, filter projects, toggle Done work, and test February 2028. Deadlines beyond the first board page must appear.
- Action Center: verify blocked/high-priority/overdue/three-day work appears once; Done/archive/trash remain excluded. Search must narrow eligible work.
- Milestones/health: add a dated checkpoint, mark complete, reload, and review explained flags. No current flags is not a delivery forecast.
- Quick find: use the button or Ctrl+K/Command+K, navigate a view/project, search all tasks, and close with Escape. Forms must not receive a second command dialog.
- Notebook: add/edit/filter notes, decisions and meetings; confirm plain-text rendering; create an editable meeting follow-up; cancel and confirm permanent entry deletion.
- Work logs: record integer minutes, edit/delete, move between weeks, filter projects and check day/project totals. Reload account mode to verify MongoDB persistence.
- Stable references: save project details for an older group, explicitly Connect existing tasks, repeat without duplicates, and verify unchanged status/checklists/context. New task labels should create/reuse a private project record.

Automated browser checks cover these flows and 320–1920px layouts. Integration tests cover cross-account isolation, strict payloads, calendar/week boundaries, pagination/overflow, and legacy linking including Archive/Trash. Live production deployment and a full accessibility audit remain unverified.

Project timeline: switch from cards, choose a month, verify clipped spans and single-date checkpoints, and open a project’s tasks. Projects without dates must say so; switching months must not invent scheduling dates.

## Two-account team verification

- Register owner/member accounts in separate browser profiles, invite/accept, refresh, and select the shared project.
- Confirm pending/declined/removed users cannot load or update shared tasks, comments, notes, or reviews.
- Create a shared task as the member. Assign to an accepted member, filter assigned-to-me, reload, then remove access and verify it disappears.
- Private task lists, private notes, and work logs must not appear to teammates. Moving a task out clears its previous assignment.
- Discuss a task with plain text; authors can delete their own comments, owners moderate all, other members cannot delete someone else's comment.
- Keep private and team notebook entries separate; verify member-own entry edits and owner moderation.
- Request a review from another member, verify pending inbox, request changes with an explanation, approve a later request, and reject repeated decisions.
- Check reviewer self-selection, unaccepted reviewers, malformed IDs, payload field injection, and cross-project task IDs.
- At widths 320, 375, 768, 1024, and 1440px, verify project selection, invitations, assignments, discussion, and review forms fit the viewport.

npm run test:browser -- --teams-only runs the isolated two-account team regression. The full browser command also verifies all personal/demo workflows. API tests include role/access boundaries and review/assignment/discussion rules.

Dependency checks cover direct/indirect cycles, same-task and foreign-task rejection, duplicate links, concurrent opposing updates, and moved-task title privacy. In Team projects, add a prerequisite, reject its reverse link, refresh, and confirm Waiting for prerequisite completion. Check the form and existing links at mobile widths; removing a link must keep its tasks.

Work requests: use a member account to submit a proposal, confirm only owners can triage, accept into the shared board, reload, and verify exactly one task. Decline another with an explanation; cancel a pending request as its requester. API tests cover concurrent acceptance, acceptance-vs-cancel, field injection, removed users, and repair of an interrupted accepting record. Tool tabs keep tasks, dependencies, reviews, and requests separate; test each at mobile widths.

Guest checks: invite as Guest, accept with a separate account, verify the read-only project brief and active tasks, search literal brackets, and remove access. API tests verify omitted task notes/links/ownership, blocked team endpoints, assignment/reviewer exclusion, mutation denial and revoked membership. Browser coverage includes guest widths 320–1440px.

Workload regression checks due/overdue estimates, unestimated and undated work, omitted future/completed work, zero versus unset capacity, member/owner authorization, revocation and export. Chromium verifies capacity save/refresh and 320–1440px layouts.

Goals checks cover member authorship/owner moderation, numeric limits, decreasing targets, bounded progress, concurrent revision conflicts and revocation. Chromium creates a 40% objective and refreshes it at mobile/desktop widths.

Project-template tests race application, repair interrupted setup, preserve customized tasks and prevent deleted task recreation after completion. Chromium applies a workshop blueprint from its preview and finds the saved starter tasks.
