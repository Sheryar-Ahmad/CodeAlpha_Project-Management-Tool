# Architecture and learning notes

## Request flow

1. React sends a same-origin request to /api with the browser session cookie.
2. Express checks the request origin for mutations and validates the JSON body.
3. Authentication hashes the opaque session token and looks up an unexpired session.
4. The route uses the authenticated user ID in its MongoDB filter.
5. MongoDB returns only that user’s data; Express serializes permitted fields.
6. React refreshes the paginated board and account-wide summary after a successful mutation.

The local demo uses a different adapter. It never sends demo tasks to the account API.

## Why these choices?

**React components:** the board, task card, task form, and authentication screen each have a defined responsibility. The workspace hook coordinates fetching, cancellation, and mutations.

**Mongoose models:** schemas define the persisted data. Zod validates request shapes first, so nested operators and unexpected ownership fields are rejected before a query is constructed.

**Cookie sessions:** the browser keeps an HTTP-only token, while MongoDB stores its SHA-256 digest. JavaScript cannot read the cookie. Authentication is checked on every protected request, including expiry even before MongoDB’s TTL cleanup.

**Password hashing:** Node’s scrypt derives a salted password hash. Plaintext passwords are never persisted. Reset and email verification are not implemented yet.

**PATCH validation:** create defaults must not be applied to partial updates. Changing a status should not clear a description or replace priority.

**Pagination:** the server returns at most 50 tasks and the UI requests 30. Counters summarize the whole account; columns show the current page, so their counts may differ from summary cards.

**Rate limits:** MongoDB stores hashed-IP counters shared across function instances. Fixed windows allow boundary bursts. A trusted proxy must be configured correctly before using forwarded addresses. Vercel’s direct proxy is trusted only under its platform environment flag; other deployments do not trust arbitrary forwarding headers.

**Search:** the query is a bounded string escaped for literal regex search. Ownership indexes constrain the scan to one user. Large accounts should move to a dedicated search index.

**SEO:** the marketing pages stay static and discoverable. The private workspace uses noindex, while API authorization protects the actual data.

## Planning and checklist patterns

**Calendar views:** Today includes unfinished work due today or overdue. Upcoming includes tomorrow through seven days ahead. The browser supplies its local calendar date; shared date helpers keep boundary calculations consistent without shifting a chosen deadline across timezones. A minute check and visibility event refresh the views after midnight.

**Stored steps, derived progress:** checklist steps are embedded within their task, capped at 20, with unique IDs. The API validates the full replacement array and owner-scopes updates. Counts and percentages are derived from current records, avoiding separate progress values that can drift out of sync.

**Project overview:** MongoDB groups only the owner's tasks by project label. Summary cards include account-wide counts and the earliest unfinished due date. The UI paginates project cards; overview and focus views avoid fetching a task page they do not display.

**Duplicate task:** copying opens an editable new-task form. The copy starts To do, with no deadline, fresh step IDs, and unchecked steps. Saving creates a new owned record; the original is unchanged.

**Focus timer:** a running session stores a deadline rather than decrementing a counter. Remaining time derives from the wall clock, so delayed browser callbacks do not accumulate drift. Timer state is local and separated by demo/account ID, survives refresh, and ends quietly. It is not cross-device synchronization or work-time reporting; the written goal is not persisted.

## Current scope

Projects are task group labels, not separate project entities. There are no memberships, invitations, roles, shared boards, or real-time synchronization in this milestone. Those require separate authorization rules and tests.

## Task lifecycle

Lifecycle is separate from progress status: a completed task can be active, archived, or trashed without losing what happened. Archive/Trash views reuse the list and task context, while editing is disabled until restoration.

Transitions use one owner-scoped conditional update that includes the expected source state. This prevents two competing transitions from both succeeding. Old records with a missing lifecycle field match active queries; no startup migration rewrites the user's database. The demo adapter follows the same source-state rules. Trash retains records until the owner explicitly permanently deletes them.

## Completion-driven recurrence

Pure calendar functions live in shared/recurrence.js so the API and demo calculate the same dates. Monthly tasks retain an anchor day rather than drifting from January 31 to March 28. The next occurrence has independent checklist IDs and preserves the previous completed record.

MongoDB uses a unique sparse repeatSource index and upsert to ensure one successor. The source also stores repeatNext to remember intentionally removed successors. Completion, successor creation, and the marker update are separate writes for compatibility with local standalone MongoDB. If a database failure interrupts this sequence, retrying the explicit Done update repairs the successor/marker without resetting completed history. This is not an all-or-nothing multi-document transaction.

## Private project records: first foundation milestone

Project documents store owner, exact name, description, start/target dates, and planning status. A unique owner/name index prevents duplicate records while letting separate accounts choose the same name. Partial updates never apply creation defaults, and both dates are validated together. The client combines metadata with existing task-group summaries; records with no tasks receive zero totals rather than NaN progress.

Tasks still group by owner plus exact name; names cannot be renamed in this step. This deliberately avoids automatic database migration or exposure to other users. New tasks now receive stable project references, and explicit legacy linking is implemented. Invitations and membership authorization are implemented through explicit shared routes. The demo keeps project details under orbit.projects.v1, validates them on read/write, and resets them alongside sample tasks.

## Incremental private foundation

ensurePrivateProject uses the unique owner/name index to make new task references stable even during concurrent creation. Project IDs are server-managed; ownership is verified before project resolution on task edits. Legacy linking is an explicit owner-scoped update across active/archive/trash, preserving all fields and existing references. Project resolution and task writes remain separate for standalone MongoDB support; an interrupted task write can leave an empty project record, without destructive rollback. Names and label summaries stay fixed during this transition.

## Calendar, attention, and notebooks

Calendar dates use date strings and UTC arithmetic; monthly reads are independent of the board page and capped with explicit overflow. Action Center eligibility is shared with the demo, and API search conditions are ANDed with eligibility. Milestones are small embedded project checkpoints; health checks explain concrete flags and do not forecast delivery. The command bar navigates existing views/projects and delegates task search to the full paginated board.

Notebook entries live in a separate owner/project-indexed collection, loaded only when opened, 20 per page. Every route verifies the private parent project. Decision and meeting entries are plain text and editable. Follow-up tasks are explicit drafts. Work logs use a separate owner/date-indexed collection with bounded weekly reads and derived totals; they do not automatically trust timer sessions or calculate capacity/billing. Demo notebooks and work logs have validated separate browser keys and reset with the demo.

All native dialogs share focus restoration that survives React Strict Mode and dialog hand-offs. Command shortcuts do not open over another active form. Shared project routes require accepted membership in addition to these stable IDs.

**Project timeline:** the same private project records can be viewed as cards or monthly date spans. Missing start/target dates are never inferred; a single date is a checkpoint, off-month spans are identified, and overlapping ranges are clipped to the selected month. It is a recorded-date comparison, not a dependency planner or automatic rescheduler.

## Explicit project sharing

ProjectMember has a unique project/user pair and invited/active/declined/revoked states. Acceptance is an atomic expected-state update by the recipient. Owners alone invite/revoke. Invitation retries cannot create duplicate pairs. Shared requests re-check the project and current membership; an already-authorized request may finish concurrently with removal.

taskScope supplies either the private session owner or the shared project's owner plus project ID. The existing task router is reused under /projects/:id/tasks with that trusted context; client owner/projectId injection remains rejected. Shared edits cannot move tasks to another project. Project metadata and legacy linking stay owner-only. The private owner can move a task out of a shared project, clearing its old assignment.

Notebook visibility defaults to private, including legacy records. Team notes use separate endpoints and visibility=team; members edit their own notes, owners moderate all. Task discussions are paginated, plain text, and author-or-owner deleted. Reads always verify the parent task and membership. Permanent task deletion removes its comments separately; interrupted cleanup can leave inaccessible orphan comments, without exposing them.

Assignments require an active task and owner/accepted assignee. Removal preserves historical work; stale assignments appear as Former member and can be cleared/reassigned. Checks and writes are separate documents for standalone MongoDB, so concurrent removal can leave a stale assignment that never grants access.

TaskReview stores a captured title/description, requester, designated reviewer, message and one terminal decision. A partial unique index allows one pending request per task/reviewer. Decisions include expected pending status and actor authorization. Reviews approve the captured brief, never current mutable task state or files. History remains project-scoped after task deletion. The derived review inbox only includes currently accessible projects; it sends no external notifications.

## Dependency graph

One ProjectDependencies document holds up to 200 edges and a revision counter. Kahn’s algorithm detects direct and indirect cycles. Every mutation compares the read revision and retries conflicts against the newer graph, preventing concurrent opposing edges from introducing a cycle. Creation verifies both tasks are active and connected to the current project. Tasks can later move/recover/delete independently; read-side scoped lookup marks unavailable endpoints without exposing their new context, and users can remove stale links. This is dependency recording, not date scheduling or task status enforcement.
