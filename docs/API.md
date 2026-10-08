# Orbit API

Base path: /api. Responses are JSON except successful deletion/logout (204).
Authenticated requests require the orbit_session cookie.
All mutations require an Origin header exactly equal to APP_ORIGIN.

| Method | Endpoint                        | Purpose                                 |
| ------ | ------------------------------- | --------------------------------------- |
| GET    | /health                         | Liveness only; not database readiness   |
| POST   | /auth/register                  | Create account: name, email, password   |
| POST   | /auth/login                     | Sign in: email, password                |
| GET    | /auth/me                        | Current account                         |
| POST   | /auth/logout                    | Revoke current session                  |
| GET    | /tasks                          | List owned tasks                        |
| GET    | /tasks/overview?date=YYYY-MM-DD | Whole-account counts and project labels |
| POST   | /tasks                          | Create owned task                       |
| PATCH  | /tasks/:id                      | Update supplied fields only             |
| DELETE | /tasks/:id                      | Delete owned task                       |

## Task fields

- title: trimmed, 1–120 characters
- project: trimmed, 1–60 characters
- description: up to 1,000 characters
- priority: low, medium, high
- status: todo, progress, done
- due: empty string or real calendar date between 2000 and 2100

Ownership and timestamps are managed by the server. Sending owner or other unrecognized fields is rejected.

List parameters: page (1–10,000), limit (1–50), search (up to 120 characters), project (up to 60). Response contains tasks, hasMore, and page. Project filter uses an exact label. Summary project labels are capped at 1,000.

## Errors

400 invalid input, 401 invalid session, 403 untrusted origin, 404 absent/not-owned task, 409 duplicate email, 413 oversized body, 429 request limit, 5xx service failure. Error responses expose a message and optional field details, never passwords, hashes, MongoDB URLs, or stack traces.
