# Manual verification
- Serve via HTTP and open the landing page, privacy page, and workspace.
- Create a task with all fields; refresh and confirm it persists.
- Edit every field and confirm the old card updates.
- Move tasks between all three statuses; confirm counts update.
- Set yesterday as a due date: unfinished tasks show overdue; completed tasks do not.
- Search by title, project, and description; test no results and clear the search.
- Filter by project, edit a project name, and verify filter options update.
- Delete a task and cancel deletion; verify both paths.
- Submit whitespace-only title/project: validation should reject it.
- Enter <img src=x onerror=alert(1)> as a title: display it literally without executing it.
- Try long text, missing dates, empty board, and a completed-only board.
- Block browser storage: changes must fail with feedback instead of silently disappearing.
- Check keyboard-only navigation, Escape to close the dialog, field labels, and focus return.
- Check widths of 375, 768, and 1440 pixels and 200% zoom.
- Open developer tools: inspect console errors and missing network assets.
- Confirm Reset demo requires confirmation and replaces tasks with sample data.
- After Vercel deployment, check security headers, real 404 responses, and public-page indexing directives.

## Verification status
Source checks are recorded in the collaboration conversation. Full interactive browser QA and production deployment remain required before claiming readiness.
