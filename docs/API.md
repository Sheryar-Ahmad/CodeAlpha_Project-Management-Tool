# Orbit API

Base path: `/api`. Responses are JSON except successful deletion/logout (204).
Authenticated requests require the `orbit_session` cookie.
All mutations require an Origin header exactly equal to APP_ORIGIN.

| Method | Endpoint                        | Purpose                               |
| ------ | ------------------------------- | ------------------------------------- |
| GET    | /health                         | Liveness only; not database readiness |
| POST   | /auth/register                  | Create account: name, email, password |
| POST   | /auth/login                     | Sign in: email, password              |
| GET    | /auth/me                        | Current account                       |
| POST   | /auth/logout                    | Revoke current session                |
| GET    | /tasks                          | List owned tasks                      |
| GET    | /tasks/overview?date=YYYY-MM-DD | Account counts and project summaries  |
| POST   | /tasks                          | Create owned task                     |
| PATCH  | /tasks/:id                      | Update supplied fields only           |
| DELETE | /tasks/:id                      | Delete owned task                     |

## Task fields

- title: trimmed, 1–120 characters
- project: trimmed, 1–60 characters
- description: up to 1,000 characters
- priority: low, medium, high
- status: todo, progress, done
- due: empty string or real calendar date between 2000 and 2100
- checklist: optional array, default empty, up to 20 steps

Each checklist step contains a unique string `id` (1–100 characters), trimmed `text` (1–160 characters), and boolean `done`. Updating a checklist replaces that array, leaving unspecified task fields unchanged. Completing every step does not automatically change task status. Existing tasks without a checklist serialize as an empty array.

Ownership and timestamps are managed by the server. Sending owner or other unrecognized fields is rejected.

## Listing and planning

List parameters: page (1–10,000), limit (1–50), search (up to 120 characters), project (up to 60), view (all, today, upcoming), date (YYYY-MM-DD).

- `view=all` is the default; date is optional.
- `view=today` requires date and returns unfinished tasks due on or before that date.
- `view=upcoming` requires date and returns unfinished tasks due after that date and within seven calendar days.
- Undated and completed tasks appear only in the all view.
- Search and exact project filters can combine with either planning view.
- Planning lists sort by due date, then ID. The all view sorts by latest update, then ID.

Example: `GET /api/tasks?view=upcoming&date=2026-10-09&page=1&limit=30` includes October 10–16.

Response contains tasks, hasMore, and page. Dates represent calendar days in the user's browser, rather than UTC instants. All query filters retain the authenticated owner.

## Overview

The overview requires a valid date and returns total, active (in progress), completed, overdue, projects (label names), and projectSummaries. Each project summary contains name, total, active, completed, overdue, and nextDue (earliest unfinished deadline or null).

Counts include the whole account, independently of task pagination and current filters. Project labels and summaries are capped at 1,000, sorted by label. They describe task groups, not shared project entities.

## Errors

400 invalid input, 401 invalid session, 403 untrusted origin, 404 absent/not-owned task, 409 duplicate email, 413 oversized body, 429 request limit, 5xx service failure. Error responses expose a message and optional field details, never passwords, hashes, MongoDB URLs, or stack traces.
