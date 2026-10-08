<div align="center">

# ◈ Orbit
### Big ideas. Clear next steps.

A focused project workspace for student teams and small teams.

**Semantic HTML · Responsive CSS · Vanilla JavaScript**

[Explore the project](#getting-started) · [Features](#what-works-today) · [Roadmap](#roadmap) · [Deployment](#deploy-on-vercel)

</div>

---

## Why Orbit?

Project work often gets scattered across messages, notes, and forgotten deadlines. Orbit brings the next steps into one board, with visible priorities and progress.

Built by **Sheheryar Ahmad**, Semester 5 Software Engineering student at **COMSATS University Islamabad**, during the **CodeAlpha Full Stack Development Internship · October 1–30, 2026**.

> **Current milestone:** a working local frontend prototype. This version has no accounts, server, database, or team synchronization. It is not yet a MERN application.

## What works today

| Capability | Details |
| --- | --- |
| Task board | To do, In progress, and Done |
| Task management | Create, edit, delete, and change status |
| Project organization | Group tasks by project and filter the board |
| Search | Search titles, descriptions, and project names |
| Deadline tracking | Due dates and overdue indicators based on the browser’s local date |
| Progress overview | Total, active, completed, and overdue task counts |
| Local persistence | Browser storage with validation and save-error feedback |
| Responsive layout | Sidebar on desktop, stacked board on smaller screens |
| Accessible controls | Semantic landmarks, labels, skip links, native dialog, keyboard focus styles |
| Public information | Static landing page and privacy notice |

Sample tasks are illustrative. Demo storage is limited to 500 tasks, titles to 120 characters, projects to 60, and descriptions to 1,000.

## Getting started

Install Python 3 if it is not already available, then serve the project:

```powershell
cd "E:\CodeAlpha_Projects\Project Management Tool"
python -m http.server 5500 --bind 127.0.0.1
```

Open **http://127.0.0.1:5500/**. The workspace is at **/app.html**.

No package installation or environment variables are required. Use a local HTTP server rather than opening HTML files directly: asset URLs are relative to the site root.

## Project structure

```text
Project Management Tool/
├── assets/
│   └── favicon.svg
├── css/
│   └── styles.css
├── docs/
│   ├── SEO.md
│   └── TESTING.md
├── js/
│   └── app.js
├── .env.example
├── .gitignore
├── app.html
├── index.html
├── privacy.html
├── README.md
├── robots.txt
└── vercel.json
```

## How it works

Task state lives in one array. Actions validate the proposed change and save it before updating the interface. A storage failure leaves the previous state intact. Rendering uses DOM elements and textContent so task input is never evaluated as markup.

This separation makes a later API integration easier: storage can be replaced by authenticated requests while keeping the presentation layer understandable.

## Data and security

- Tasks are saved under **orbit.tasks.v1** in browser local storage.
- There is no authentication. Anyone using the browser profile can access the demo.
- Do not enter confidential information or secrets.
- Reset demo replaces all tasks with samples after confirmation.
- Browser storage can be cleared or disabled; it is not a backup.
- Environment files are ignored, except the placeholder .env.example.
- Vercel configuration supplies security headers. Local Python serving does not.
- Input checks in this prototype do not replace server-side authorization and validation.

## Deploy on Vercel

1. Create your GitHub repository, for example **CodeAlpha_ProjectManagementTool**.
2. Push this project as the repository root.
3. Import it in Vercel.
4. Select **Other** as the framework preset, leave the build command empty, and use **.** as the output directory.
5. Check the landing page, workspace, privacy page, favicon, and response headers.
6. Complete the production-domain steps in [the SEO checklist](docs/SEO.md).

A deployment URL, screenshots, and measured performance results will be added after verification. No production deployment has been made yet.

## SEO

Public content is delivered in HTML with descriptive titles, page descriptions, crawlable links, and responsive layouts. The workspace has a noindex directive. This directive does not protect private information.

Canonical URLs, sitemap URLs, social sharing URLs, and site-name structured data depend on the final production domain and are intentionally deferred. See [docs/SEO.md](docs/SEO.md) for launch checks and the supplied SEO requirements.

## Roadmap

- [x] Public landing page and local task board
- [x] Separate semantic HTML, CSS, and JavaScript files
- [x] Local input validation and persistence feedback
- [ ] Confirm MongoDB or Supabase architecture
- [ ] React component migration
- [ ] Authentication and authorized workspace access
- [ ] Database persistence and project memberships
- [ ] Server validation, pagination, and query indexing
- [ ] API integration tests
- [ ] Optional live updates and activity history
- [ ] Production SEO verification, screenshots, and demo video

MongoDB and Supabase PostgreSQL are different databases. A production database decision must be confirmed before backend implementation. Scheduled health checks, if selected, will require protected server endpoints; a heartbeat does not guarantee a free database will never pause.

## Quality checks

Follow [the manual test checklist](docs/TESTING.md) before sharing or deploying. Browser, accessibility, and deployment checks must be recorded honestly; do not claim a perfect audit score without measured results.

## Author

**Sheheryar Ahmad**  
Software Engineering · COMSATS University Islamabad  
CodeAlpha Full Stack Development Intern · October 2026

Copyright (c) 2026 Sheheryar Ahmad. All rights reserved. See [NOTICE](NOTICE). No general reuse license is granted. Public source code can still be copied technically; attribution notices establish provenance rather than prevent copying.
