# Orbit API

Base path: `/api`. Responses are JSON except successful deletion/logout (204).
Authenticated requests require the `orbit_session` cookie.
All mutations require an Origin header exactly equal to APP_ORIGIN.

| Method | Endpoint                        | Purpose                                           |
| ------ | ------------------------------- | ------------------------------------------------- |
| GET    | /health                         | Liveness only; not database readiness             |
| POST   | /auth/register                  | Create account: name, email, password             |
| POST   | /auth/login                     | Sign in: email, password                          |
| GET    | /auth/me                        | Current account                                   |
| POST   | /auth/logout                    | Revoke current session                            |
| GET    | /tasks                          | List owned tasks                                  |
| GET    | /tasks/overview?date=YYYY-MM-DD | Account counts and project summaries              |
| POST   | /tasks                          | Create owned task                                 |
| PATCH  | /tasks/:id                      | Update supplied fields only                       |
| DELETE | /tasks/:id                      | Move active or archived owned task to Trash       |
| PATCH  | /tasks/:id/lifecycle            | Archive, unarchive, or restore an owned task      |
| DELETE | /tasks/:id/permanent            | Permanently delete an owned task already in Trash |

## Task fields

- title: trimmed, 1–120 characters
- project: trimmed, 1–60 characters
- description: up to 1,000 characters
- notes: plain text up to 3,000 characters
- links: up to 8 resources, each with a label (1–100 characters) and HTTP/HTTPS URL (up to 2,048 characters); embedded credentials are rejected
- priority: low, medium, high
- status: todo, progress, blocked, done
- blockerReason: trimmed plain text up to 500 characters; required when blocked
- due: empty string or real calendar date between 2000 and 2100
- checklist: optional array, default empty, up to 20 steps

Each checklist step contains a unique string `id` (1–100 characters), trimmed `text` (1–160 characters), and boolean `done`. Updating a checklist replaces that array, leaving unspecified task fields unchanged. Completing every step does not automatically change task status. Existing tasks without a checklist serialize as an empty array.

Ownership and timestamps are managed by the server. Sending owner or other unrecognized fields is rejected.

## Listing and planning

List parameters: page (1–10,000), limit (1–50), search (up to 120 characters), project (up to 60), view (all, today, upcoming, blocked, archived, trash), date (YYYY-MM-DD).

- `view=all` is the default; date is optional.
- `view=today` requires date and returns unfinished tasks due on or before that date.
- `view=upcoming` requires date and returns unfinished tasks due after that date and within seven calendar days.
- Daily views exclude undated and completed work. The Blockers view includes blocked tasks even without a deadline.
- `view=blocked` does not require date; its results sort by latest update.
- Search includes title, project, description, notes, and blocker reasons. Search and exact project filters can combine with either planning view.
- Planning lists sort by due date, then ID. The all view sorts by latest update, then ID.

Example: `GET /api/tasks?view=upcoming&date=2026-10-09&page=1&limit=30` includes October 10–16.

Response contains tasks, hasMore, and page. Dates represent calendar days in the user's browser, rather than UTC instants. All query filters retain the authenticated owner.

## Overview

The overview requires a valid date and returns total, active (in progress), completed, overdue, projects (label names), and projectSummaries. Each project summary contains name, total, active, completed, overdue, and nextDue (earliest unfinished deadline or null).

Overview and project summaries also expose blocked counts. Counts include the whole account, independently of task pagination and current filters. Project labels and summaries are capped at 1,000, sorted by label. They describe task groups, not shared project entities.

Request JSON is capped at 32 KiB. The server stores links as references and does not fetch their contents. Updates replace only supplied fields; omitted notes/resources remain intact.

When creating a blocked task or changing status to blocked, send a nonempty blockerReason. Changing blockerReason requires an explicit status in the same PATCH. Leaving blocked clears the old reason in that write.

## Errors

400 invalid input, 401 invalid session, 403 untrusted origin, 404 absent/not-owned task, 409 duplicate email, 413 oversized body, 429 request limit, 5xx service failure. Error responses expose a message and optional field details, never passwords, hashes, MongoDB URLs, or stack traces.

## Archive and Trash

Task responses include lifecycle: active, archived, or trashed. It is server-managed; normal create/update payloads cannot set it. Older records without the field remain active.

Normal lists, daily views, Blockers, and project summaries include only active records. Overview also returns archived and trashed counts. view=archived and view=trash list only those owned records, with the same bounded pagination and search.

PATCH /tasks/:id/lifecycle accepts only { "action": "archive" }, { "action": "unarchive" }, or { "action": "restore" }. Archive requires an active task; unarchive requires an archived task; restore requires a trashed task. Restore/unarchive return it to active work while preserving its task status, date, notes, resources, and checklist progress. Invalid source states return 404 without exposing another account's records.

DELETE /tasks/:id moves an active/archived task to Trash (204). DELETE /tasks/:id/permanent only removes an already trashed record (204). Archived/trashed tasks cannot be edited through normal PATCH. There is no automatic Trash purge or claim of database-backup erasure.

## Private export

GET /tasks/export requires a valid session and returns an envelope with format=orbit-task-export, version=1, exportedAt, scope=account, and tasks. It includes all owned active/archived/trashed tasks, independent of list filters. Fields are explicitly allowlisted; owner references, passwords, sessions, and credentials are excluded. Responses remain no-store.

Exports are bounded to 1,000 tasks. Larger accounts receive 413 with no partial task array. A MongoDB-backed per-account limit allows five export requests per hour (429 when exceeded). The export currently supports no import endpoint.

## Recurrence

recurrence defaults to none and accepts none, daily, weekly, monthly. A repeating task requires a nonempty due date. PATCH setting a non-none recurrence must include its due date. To clear a repeating deadline, also set recurrence=none; clearing it alone returns 404 without changing the record. repeatDay, repeatSource, and repeatNext are server-managed and rejected in payloads.

Creating a Done repeating task or explicitly PATCHing status=done ensures one next occurrence and may return nextTask alongside task. The next task retains context, starts To do, and uses fresh unchecked steps. Its unique source index prevents completion retries/concurrent requests from creating duplicate successors. A completed source retains a successor marker so deleting that successor deliberately does not recreate it on a later retry.

Monthly calculations preserve the original day through short months; an explicitly changed due date establishes a new anchor. Scheduling advances by one interval from the previous due date, including overdue dates. No background worker creates missed occurrences, and recurrence stops at the supported date limit (2100-12-31).

## Private project records

GET /projects lists up to 1,000 owned project records, sorted by exact name, with hasMore if further records exist. POST /projects creates one with name (trimmed 1–60 characters), description (up to 1,000), optional startDate/targetDate (real calendar dates in the supported range), and status (planned, active, onhold, completed). Target cannot precede start. Duplicate exact names in one account return 409; separate accounts can use identical names.

PATCH /projects/:id edits description, dates, status, or milestones, retaining omitted fields. Names are immutable in this first milestone because task grouping still uses exact labels. Changing either date requires both fields in that request so the range is validated as one update. Owner/unknown fields are rejected, all reads/writes are owner-scoped, and mutations require the trusted origin. This endpoint does not share projects or rewrite existing tasks.

Project planning status is manually selected and does not mark tasks Done. Empty records appear in the client with zero task completion. Existing label groups can gain project details without data migration. Project metadata is not included in the current task-only export.

## Calendar and Action Center

GET /tasks/calendar?month=YYYY-MM&project=label returns active tasks due in the whole month, including Done tasks. The client hides completed work by default. It is independent of board pagination, sorted by date/ID, owner-scoped and capped at 1,000 with truncated=true for overflow. Missing/invalid months and unknown query fields return 400. Undated, archived, and trashed tasks are excluded.

GET /tasks?view=attention&date=YYYY-MM-DD uses the normal pagination, search, and project filter. It includes unfinished active tasks that are blocked, high priority, overdue, or due within three calendar days. Search and attention conditions are combined; an overlapping task appears once.

## Milestones and stable project references

Project create/full edit supports milestones: up to 20 unique {id,title,due,done} records, title up to 120, optional valid date, Boolean completion. Omitted PATCH milestones are preserved. Health is derived by the client and is not a stored forecast.

New task creation/project-label edits resolve an owner/name project record and store its stable projectId; this field is server-managed and rejected in task payloads. Recurring successors retain the reference. Existing records without it remain readable. PATCH /projects/:id/link-tasks with an empty payload connects only matching owner/name tasks without a reference, across all lifecycle states. It returns {linked}, is idempotent, never renames/reassigns records, and does not grant shared access.

## Project notebook

GET /projects/:id/notes?page=1&kind=decision lists 20 entries, sorted by update time/ID, with hasMore. Kind can be empty, note, decision, or meeting. Every operation checks ownership of the parent project and the entry. POST creates; PATCH /projects/:id/notes/:noteId replaces kind/title/body/date; DELETE permanently removes the owned entry. Payloads are strict: title 1–120, body 1–3,000, kind enum, nonempty valid date. Returned fields exclude owner/project references. Entries are editable and do not constitute an immutable audit log. Meeting follow-ups open an ordinary editable task draft; no automatic task or email is created.

## Manual work logs

GET /work-logs?date=YYYY-MM-DD&project=label returns logs for the Monday–Sunday week containing that date, plus range and truncated. It caps results at 1,000; client totals are explicitly partial on overflow. POST creates; PATCH /work-logs/:id replaces validated fields; DELETE permanently removes the owned log. Fields: activity 1–120, project label 1–60, valid nonempty date, integer minutes 1–1,440, optional notes up to 500. No owner or arbitrary query operators are accepted. Entries are manual, may overlap, and are independent of task completion/focus timers. Notebook entries, work logs, and project metadata are not part of the current task export.

## Team projects and permissions

All routes below require a session and trusted mutation origin.

| Endpoint                                                       | Behavior                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| GET /teams                                                     | Owned/accepted project list, recipient invitations, pending review inbox; explicit truncation |
| PATCH /teams/invitations/:id                                   | {action: accept or decline}; recipient and invited state required                             |
| GET /projects/:id/members                                      | Owner/accepted member directory; names only                                                   |
| POST /projects/:id/members                                     | Owner-only {email}; existing account, not the owner                                           |
| DELETE /projects/:id/members/:membershipId                     | Owner-only cancellation/revocation; preserves work                                            |
| /projects/:id/tasks                                            | Same task CRUD/calendar/overview/export/lifecycle routes, bounded to connected project tasks  |
| /projects/:id/team-notes                                       | Notebook CRUD with shared visibility; member edits own entries, owner manages all             |
| PATCH /projects/:id/collaboration/:taskId/assignee             | {assignee: account ID or null}; accepted member/owner on active task                          |
| GET /projects/:id/collaboration/:taskId/comments               | page-based comments, 20 per page                                                              |
| POST /projects/:id/collaboration/:taskId/comments              | {body}; plain text, 1–2000 characters, active task                                            |
| DELETE /projects/:id/collaboration/:taskId/comments/:commentId | Author or owner moderation                                                                    |
| GET /projects/:id/reviews                                      | page and status filters, 20 per page; pending/approved/changes/cancelled                      |
| POST /projects/:id/reviews                                     | {task,reviewer,message}; active connected task, another accepted member or owner              |
| PATCH /projects/:id/reviews/:reviewId                          | {action: approve, changes, or cancel; response}; changes require explanation                  |

Shared task lists accept assigned=me (or empty) to filter the session user's assignments. Private lists still return only owned tasks. Shared tasks cannot change project labels, and only owners permanently delete them. Pending/declined/revoked members and outsiders receive 404 for shared reads/writes. Shared access never grants private notebooks, work logs, project administration, or unrelated task access.

Review requests capture title and description at creation, not a full task/file snapshot. Only the designated reviewer decides; the requester or owner can cancel pending requests. A second decision returns 409; duplicate pending requests return 409. History does not change task status and remains project-scoped after task deletion. Invitations and review inbox entries are in-app; no email provider is invoked.

## Dependencies

GET /projects/:id/dependencies returns at most 200 directed links and current scoped task titles/statuses. POST accepts {from,to} for two active connected tasks. DELETE accepts the same pair, keeping tasks intact. Owner/accepted members can manage links. Self-links, duplicates, foreign tasks, and circular chains are rejected. Missing/moved/trashed tasks return null task details without leaking new project data. A per-project revision compare-and-swap validates concurrent changes against the entire graph; it requires no MongoDB transactions. Links are informational and do not gate status or automatically reschedule work.

## Project work requests

GET /projects/:id/requests supports page and pending/accepted/declined/cancelled status filters, 20 per page. Pending includes interrupted accepting records. POST accepts {title,description,priority,due} from an owner/accepted member. PATCH /:requestId accepts {action: accept, decline, or cancel; response}; owners accept/decline, requesters or owners cancel pending requests. Decline needs an explanation. Acceptance reserves state=accepting, creates one task using a preallocated ID, then records accepted. Retrying an interrupted accepting record repairs it without duplicate tasks. Accepted retries return its recorded task ID without recreating a deliberately deleted task. Requests are project-visible, authenticated intake, not public anonymous forms.

## Guest portal

Owner invitations accept role=member (default) or guest. A guest must accept the invitation through their own account. GET /projects/:id/guest returns project name/brief/status/dates/milestones and 30 active task summaries per page, searchable by literal title. Task fields are limited to ID/title/description/priority/status/due. Guests cannot access team tasks, notes, discussions, reviews, request intake, dependencies, directories, assignments, exports, or mutations. Pending/removed guests receive 404. Guest accounts have their own separate personal workspace.

### Weekly project workload

- `GET /api/projects/:id/workload?date=YYYY-MM-DD`: Monday–Sunday totals of unfinished active tasks due through Sunday, including overdue carry-in. Undated tasks are separate; completed/archived/trashed/future tasks are excluded. Estimates use `estimateMinutes` (0 means missing).
- `PATCH /api/projects/:id/workload/capacity`: `{ date, user, minutes }` where minutes is 0–10080 or null to clear. Owners may edit eligible teammates; members edit themselves. Each budget applies only to this project and week. Guests cannot access either route.
- Up to 100 active teammates plus the owner are named; other/former assignments are grouped, not leaked through private user lookups. Private work logs are never read.

### Measurable project goals

`GET/POST /api/projects/:id/goals` lists 20 goals per page or creates `{ title, due, results }`. Each goal has 1–8 results `{ id, title, unit, baseline, current, target }`; numeric measures are bounded to ±1 billion. Members edit goals they create; owners edit any; guests have no access.
`PATCH/DELETE /:goalId` requires the last-read `revision`, preventing silent stale overwrites. PATCH sends the complete goal; DELETE sends only revision. Result progress is a clamped baseline-to-target ratio (increasing or decreasing), and objective progress is an equal-weight average. No automatic task updates or forecast is implied.

### Project starter workflows

`GET /api/projects/:id/workflow/template` returns setup status. The owner can `POST { templateId }` using workshop-v1, launch-v1 or research-v1. Applying reserves fixed task IDs and adds three starter tasks without replacing existing work. Concurrent/repeated requests use those IDs. An interrupted setup is repairable with the same template; an already completed setup never recreates deliberately deleted tasks. A different template returns 409. Guests are excluded. The UI shows an explicit preview and confirmation.

### Backup imports

Account-only `POST /api/imports/preview { file }` checks an Orbit v1 JSON export (1 MB / 100 tasks maximum). `POST /api/imports { file, key, projectName }` uses a client UUID key and a new project name. The server reserves fresh task IDs, checks retry content by digest, and preserves user edits while repairing partial setup. Completed retries never recreate deleted tasks. Task content, estimates and lifecycle are restored; assignments, old IDs and repeating schedules are not. Preview/save are limited to 20 combined attempts/hour/account. Completed jobs discard copied task content, retaining only retry metadata.

### Account security

`POST /api/auth/recovery-code { password }` verifies the current password and returns a fresh 64-character one-time code. Only its SHA-256 digest is stored. Generation replaces the old code.
`POST /api/auth/recover { email, code, password }` atomically consumes the code, changes the password and revokes older sessions. It does not sign in automatically. Invalid/used/unknown credentials return the same error.
`POST /api/auth/password { password, newPassword }` requires the current password, revokes other sessions and recovery codes, and renews the caller's session. Session versions reject earlier credentials even if cleanup races with login.
All three routes use the authentication attempt limit. Recovery has no email fallback: a lost password without a saved code cannot be reset through this workflow.

### Account deletion and scheduled maintenance

`DELETE /api/account { password, confirmation: "DELETE" }` freezes the caller after password confirmation. It removes up to five owned projects per batch and their team records, personal data, authored contributions, memberships and assignments. Returns 202 to continue safely or 204 when finished. Owned shared projects are removed too; other accounts' owned work is preserved. A frozen account can only read its account identity, sign out or continue deletion; sign-in can resume an interrupted deletion.
`GET /api/maintenance` requires `Authorization: Bearer <CRON_SECRET>` (32+ characters). It processes up to ten deletion records and repeats completed cleanup for writes already in flight. Minimal account-ID cleanup markers expire after 90 days; no password/recovery code is retained there. The Vercel configuration schedules this daily at 03:00 UTC; configure the secret before enabling production cron. Deletion does not promise erasure from provider backups.

### Opt-in project automation

`GET/PATCH /api/projects/:id/workflow/automation` reads or changes `{ checklistToDone, overdueHigh, revision }`. Only owners configure rules, and stale revisions return 409. Both rules default off.
A non-empty all-checked checklist saved without an explicit task-status change can complete an eligible To do/In progress task; empty lists and Blocked tasks are excluded. Existing recurrence creates its next occurrence through the normal retry-safe completion path.
`POST /workflow/automation/run {}` lets the owner run saved overdue-priority rules. Up to 100 active unfinished tasks with due dates before the current UTC date become High priority; done, recovered, undated and future work is untouched. Runs are idempotent. Daily maintenance processes up to ten configured projects ordered by oldest run, so it is a bounded daily sweep, not an exact-time notification or automation builder.

### Calendar handoff

`GET /api/tasks/calendar-export` returns `{ calendar, count }` for up to 1000 owner-scoped active, unfinished dated tasks. Shares the task-export five/hour account limit. The UI downloads a private .ics file; demo export stays local. Events are all-day deadlines with stable UIDs, CRLF escaping and UTF-8 line folding according to [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545). Notes/resources are omitted; titles, project names and descriptions are included.
Per-task Google Calendar links open a prefilled event for the user to review and save, following [Google's calendar-link guidance](https://developers.google.com/workspace/calendar/api/concepts/inviting-attendees-to-events). Calendar-file imports and links are manual snapshots, not a live connection. Repeated imports may duplicate events depending on the calendar app. [Google import instructions](https://support.google.com/calendar/answer/37118).

### Dependency date planning

`POST /api/projects/:id/schedule/preview { startDate }` is owner-only (30/hour), reads up to 200 active tasks, and creates a server-held proposal expiring after one hour. Task `durationDays` is 1–365 (default 1). The topological earliest-start calculation uses calendar days, parallel independent work, and completed prerequisites as satisfied. It excludes repeating tasks and refuses unavailable/circular/repeating prerequisite chains. Existing dates, weekends, holidays and capacity are not planning constraints.
`POST /schedule/:planId/apply {}` saves up to 25 pending dates per batch. Each write checks owner/project/lifecycle/status, the previewed due date and update timestamp. Changed records are skipped as conflicts; already-matching dates are safe on retries. Results persist so interrupted batches resume. A short lease prevents duplicate active applies. Graph revision changes refuse further apply and warn when detected during a batch. This is deliberately a resumable batch workflow, not an all-or-nothing transaction; earlier saved dates remain if later tasks conflict.

### Portfolio and work digest

GET /api/teams/portfolio?date=YYYY-MM-DD derives current reports for up to 100 owned and 100 accepted-member projects. Guest-only, pending, revoked and closed-owner projects are excluded. Project statistics include connected active tasks only and expose explained health flags, completed counts and next deadlines. Empty projects stay visible.

The digest includes up to 30 urgent owned tasks/shared tasks assigned to the caller, pending reviews addressed to the caller, owned-project intake awaiting triage, and invitations. Groups expose truncation flags. Only task titles, labels, dates and attention reasons appear; private notes, links, discussion and review descriptions are omitted. Dates are the caller's local calendar date, validated server-side. This is a current snapshot with visible-tab refresh, not notification history, email delivery or a delivery forecast.

### Optional public work requests

Owner-only GET/POST /api/projects/:id/intake-link reads enabled status or applies { action: "rotate" | "disable" }. Rotating returns a random 64-character token once and invalidates the previous link. MongoDB stores only its SHA-256 digest. The UI puts the token in a URL fragment; it is sent to the API through X-Orbit-Intake rather than a URL or query string.

Public GET /api/intake with that header returns only the project name. POST accepts { key: UUID, submitter, title, description, due, website: "" }. Names/aliases are unverified. No contact address, member list, tasks, project description, decision status or request IDs are exposed publicly. Retries with the same project/key and normalized content create one request; changed content returns 409. Priorities start Medium. Only the owner can accept into the board or decline; accepted members can see submissions, and guests cannot.

Database-backed limits allow 60 form visits/hour/IP, 8 submission attempts/hour/IP, and 40 attempts/day/link, in addition to the normal API limit. Invalid submissions/retries consume attempts. A hidden empty website field catches basic form bots; this is not a CAPTCHA or complete spam prevention. Links can be disabled; existing submissions stay available for triage. Already-authorized submissions may finish concurrently with rotation/deletion and are covered by normal deletion cleanup.

### Targeted discussion notifications

POST /api/projects/:id/collaboration/:taskId/comments accepts optional notified: an owner/accepted-member user ID, or null. One other person can be notified per comment; self, guest, pending, revoked and foreign recipients are rejected. Comments remain plain text. The recipient's Portfolio digest shows unread notification/task summaries, without copying the comment body into the report.

PATCH /collaboration/:taskId/comments/:commentId/read with {} acknowledges only a notification addressed to the current caller. Every request checks project membership and current task scope. Deleted or moved tasks/comments disappear from the digest; account deletion clears recipient references. The inbox is bounded to 30 unread active-task notifications and refreshes in a visible tab. This is in-app delivery; no email, push service or live socket is implied.

### Resource-link approvals

Review creation accepts optional includeResources: true. The server captures up to eight validated resource labels/URLs from the current scoped task; caller-supplied resources are rejected, and a task without resources cannot request a resource review. Listing returns the captured resources alongside the brief. The designated reviewer uses the normal approve/request-changes flow.

Later task-link edits never replace a review snapshot. External file contents can change at the same URL; Orbit does not fetch, upload, fingerprint or lock those files. This records approval of the brief and linked resources presented for review, not an immutable binary-file version.

### Independent subtasks and recent task activity

Account routes (also available under `/api/projects/:projectId/tasks` for accepted members):

- `GET /api/tasks/:id/details?page=1`: scoped parent summary, 30 children/page, eligible assignees, pending setup title and the latest 50 activity events. Guests, revoked members and other owners cannot access details.
- `POST /api/tasks/:id/subtasks { key: UUID, task: taskDraft }`: one-level child in the same project, with independent status/deadline/assignment. Task drafts cannot inject owner, parent or project IDs. Recurring tasks cannot be parents or children.
- `POST /api/tasks/:id/subtasks/resume {}`: repair interrupted reserved setup. Reuses the saved ID without overwriting an existing child. Active worker leases return 409; retry after one minute.
- `PATCH /api/tasks/:id/subtasks/detach {}`: make an active child independent without changing its content/project/assignment. Pending setup must finish first.

Creation uses a normalized-content digest and persisted receipt. Identical completed retries return the existing child, or `{ task: null, previouslyRemoved: true }` if it was removed/detached. Changed content under the same key returns 409. Each root supports 100 retained children and 200 lifetime creation receipts. Requests use existing account/IP limits. Pending setup blocks parent lifecycle/project changes. Child lifecycle/detach operations also wait while their setup is pending. Parent completion/archive/trash does not cascade; retained children (including Trash/archive) block parent moves, recurrence and permanent deletion. This is a resumable workflow on standalone MongoDB, not an all-or-nothing transaction.

Activity records actor name, action, field names and time, without previous values. Normal board responses omit history and setup receipts/drafts. Project moves reset history; deleted actors become `Former account`. Recorded task changes include ordinary edits, assignment, lifecycle, subtask setup/detach, imports, templates, recurring creation, overdue priority rules and dependency schedule application. It does not record every read, discussion or project-level action and is not a compliance audit log. Previously existing records have no retroactive events. Task exports retain parent IDs as metadata; imports deliberately flatten subtasks into independent tasks in the new private project. The import confirmation states this behavior.
