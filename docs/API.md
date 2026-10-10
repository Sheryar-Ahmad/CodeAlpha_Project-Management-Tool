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
