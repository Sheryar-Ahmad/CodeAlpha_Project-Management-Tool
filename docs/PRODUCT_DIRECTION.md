# Orbit product direction

## What the supplied proposal gets right

People need help knowing what matters next, what is stuck, and where useful context lives. A clear My Work screen, reusable workflows, task context, and recovery from mistakes fit that purpose.

The proposed 30-area catalogue is a long-term SaaS roadmap. Its claim that every foundation item is essential for a professional product is too broad for Orbit's current personal-workspace release. A focused product can be professional through reliable behavior, clear limits, useful workflows, and an interface people understand.

## Existing capabilities

Orbit already has private accounts, a task board, priorities, deadlines, search, project labels and summaries, Today/Upcoming, checklists, duplication, and a local focus timer.

Important distinctions:

- A project label is not a shared project entity.
- A checklist step is not an independently assigned subtask.
- The focus timer is not billable time tracking or a timesheet.
- A progress percentage is a completed-task ratio, not a delivery forecast.
- Ownership protects each account's records; it does not implement team roles.

## Compact additions worth prioritizing

These are the ordered extension milestones. Task notes/resource links, blocker reasons, curated task templates, the list view, archive/recovery, task export, and completion-driven recurrence are now implemented; the remaining items below are pending.

| Addition                      | Genuine problem                                    | Bounded first version                                                                            |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Blocker reason                | “I cannot move this forward, and I forget why.”    | Explicit blocked state with a short reason and clear filtering; no dependency graph              |
| Task notes and resource links | “The document or decision is buried in chat.”      | Plain-text task context and validated HTTP/HTTPS links; no rich-text wiki or file uploads        |
| Reusable templates            | “I keep recreating the same steps.”                | A few curated task/checklist templates with editable previews; no industry-wide workflow builder |
| List view                     | “A board makes scanning deadlines slow.”           | An alternative presentation of the same paginated, owner-scoped results                          |
| Archive and recovery          | “Old work clutters the board; deletion scares me.” | Define archive/trash/restore rules before altering data retention; keep them distinct            |
| Recurring tasks               | “Weekly work is easy to forget.”                   | Choose explicit recurrence rules, preserve completion history, and prevent duplicate occurrences |
| Backup/export                 | “I want a copy of my own work.”                    | Export owned data first; validate imports separately before allowing writes                      |

Next implementation milestone: **shared-project entities and membership authorization**. Finish account recovery, deletion, and operational launch requirements before promoting broad public adoption.

Recurring scheduling needs decisions about timezone, missed runs, end-of-month dates, and idempotency. It should not merely erase a completed task and reset its history.

## Architecture decision before team features

Shared projects require explicit agreement before implementation:

1. Replace label-only groups with project records and migrate existing tasks safely.
2. Define workspace/project memberships and server-side authorization for every read/write.
3. Decide invitation, revocation, and role rules.
4. Add owner/member isolation tests before exposing shared content.
5. Build assignment and contextual comments on that foundation.

Approvals, mentions, workload reporting, guests, activity feeds, and team notifications depend on this work. A simple two-role owner/member model is a more manageable first decision than six overlapping enterprise roles.

## Later milestones

Gantt charts, critical paths, automatic rescheduling, enterprise workload planning, client portals, OKRs, custom-field builders, automation builders, and external integrations each introduce substantial behavior and maintenance costs.

Dependencies also require cycle checks, same-project access rules, and deletion behavior. Workload reports need reliable estimates and capacity information; task counts alone do not prove someone is overloaded. Forecasts should explain their assumptions rather than implying unsupported certainty.

Do not copy the proposed 15-item sidebar. Navigation should grow only when a shipped capability needs it.

## UI direction

Preserve Orbit's navy, purple, teal, and restrained amber palette. Use color to support status and priority while retaining visible text labels.

Current polish:

- Page headings and breadcrumbs identify the active view.
- Today and Upcoming show unfinished-work columns rather than an always-empty Done column.
- Account-wide counters explicitly say “Across your workspace.”
- Focus removes task counters and the unrelated New task action.
- Task text is easier to read, card actions have larger targets, and tablet layouts avoid squeezed status controls.
- Pagination appears when there is another page or the user has advanced beyond the first.
- Keyboard focus indicators and reduced-motion behavior remain available.

The aim is comfortable, useful work and easy return visits. Extra animations, notification pressure, and longer session time are not substitutes for solving users' problems.

These choices follow [USWDS principles on real user needs and ease of use](https://designsystem.digital.gov/design-principles/) and are informed by [WCAG guidance for keyboard focus and target size](https://www.w3.org/TR/WCAG22/). They do not constitute a full accessibility audit or proof that all users prefer the design.

## Review gates

Before shipping another feature, name the problem, define the smallest useful workflow, cover authorization and validation, and verify its empty/error/mobile states. Review the result with representative users; actual feedback should decide whether further polish or more functionality helps.

## Authorized expansion and delivery tracking

The proposal, excluding AI assistance at the user's request, is authorized for incremental implementation after the saved baseline `orbit-snapshot-2026-10-09`. Each milestone must remain usable, validated, tested, and committed before the next. Integrations requiring external accounts will be identified explicitly.

| Proposal area                                                          | Current delivery status                                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1. Workspaces, projects, tasks, ownership, subtasks, context, recovery | Personal task foundation and context implemented; recovery implemented; team/project entities pending |
| 2. Multiple views / My Work                                            | Board, list, Today, Upcoming implemented; calendar/timeline pending                                   |
| 3. Dependencies                                                        | Pending                                                                                               |
| 4. Milestones                                                          | Pending                                                                                               |
| 5. Useful dashboard                                                    | Personal overview implemented; team reporting pending                                                 |
| 6. Workload and capacity                                               | Pending                                                                                               |
| 7. Time tracking                                                       | Local focus timer implemented; persisted work logs/timesheets pending                                 |
| 8. Notifications and digest                                            | Pending                                                                                               |
| 9. Contextual team communication                                       | Pending                                                                                               |
| 10. Approvals                                                          | Pending                                                                                               |
| 11. Blockers                                                           | Implemented: required reasons, dedicated view, and project counts                                     |
| 12. Project health                                                     | Pending                                                                                               |
| 13. Roles and permissions                                              | Private owner-scoped accounts implemented; team roles pending                                         |
| 14. Guest/client portal                                                | Pending                                                                                               |
| 15. Project templates                                                  | Curated task/checklist starters implemented; multi-task project templates pending                     |
| 16. Recurring tasks                                                    | Implemented: daily/weekly/monthly next occurrence on completion; no background scheduler              |
| 17. Forms / work requests                                              | Pending                                                                                               |
| 18. Automation                                                         | Pending                                                                                               |
| 19. Integrations                                                       | Pending; provider configuration required for live connections                                         |
| 20. Command bar / global search                                        | Task search implemented; command bar pending                                                          |
| 21. Team directory                                                     | Pending                                                                                               |
| 22. Project notes / documentation                                      | Task notes and safe resource links implemented; project docs pending                                  |
| 23. Decision log                                                       | Pending                                                                                               |
| 24. Meeting action items                                               | Pending                                                                                               |
| 25. AI assistance                                                      | Excluded at the user's request; no AI assistant or AI-generated features planned                      |
| 26. Action Center                                                      | Daily planning implemented; unified attention view pending                                            |
| 27. Portfolio                                                          | Personal label overview implemented; multi-project portfolio pending                                  |
| 28. Goals / OKRs                                                       | Pending                                                                                               |
| 29. Admin / export / account lifecycle                                 | Private task export implemented; import and account lifecycle pending                                 |
| 30. UX                                                                 | Responsive baseline implemented; ongoing polish and verification                                      |
