# AMR Hub

**Project and issue tracking for software teams.** Plan sprints, run boards,
map out roadmaps and keep everyone on the same page, in one workspace with a
retro console look.

![AMR Hub](public/og-retro.png)

AMR Hub covers the whole loop: capture work, plan it, move it across a board,
ship releases and report on how it went. Every workspace is isolated, every
change is recorded, and the data lives in your own PostgreSQL database.

## Features

### Plan and track

- **Boards** for Scrum and Kanban, with per column scrolling, column limits,
  swimlanes, quick filters, card colours, days in column and a stand-up mode
- **Backlog and sprints** with drag and drop ranking, parallel sprints, sprint
  goals, workload per assignee and story point estimates
- **List view** with inline editing, hierarchy, grouping, format rules that
  highlight matching rows, a chart view and bulk changes
- **Calendar** with month and week views and an unscheduled panel
- **Timeline and roadmap** with dependencies, release markers and epics from
  several projects on one view
- **Releases** with progress, drivers, grouping and release notes
- **Hierarchy totals** so epics and stories show story points and time from
  everything beneath them

### Work items

- Custom workflows with named transitions and a workflow view
- Custom work types and twelve kinds of custom fields
- Rich text descriptions and comments with mentions, reactions, tables, code
  blocks and pasted images
- Links between work items, links to outside pages, attachments, watchers,
  votes, time tracking and a full history
- Print, or export as Word, XML or a CSV file for Excel
- A create dialog that can be minimized while you browse and trimmed to the
  fields you use

### Search, filters and dashboards

- A query language with autocomplete, functions such as `currentUser()` and
  `openSprints()`, and sorting
- Saved filters shared with the workspace, a project, a team or one person,
  plus scheduled email subscriptions
- Exports as CSV, HTML report, XML or Word, and printable lists
- Dashboards built from gadgets, with sharing, a wallboard and slideshow mode,
  and per viewer minimize and maximize

### Automation and notifications

- Rules with triggers, conditions, actions, smart values and a run log
- In app and email notifications per event, with immediate or daily delivery,
  plain text emails, due date reminders and a weekly summary

### Workspace and security

- Organizations with owners, members and viewers, and invitations by link
- Project access levels (open, limited, private) and project roles
- Trash with restore and archiving for projects and work items
- Passkeys, authenticator app two factor sign in, backup and recovery codes,
  per device session sign out and account lockout
- A REST API with personal tokens, webhooks and an audit log
- Personal settings for homepage, theme, auto-watch and email preferences

## Tech stack

| Area | Tools |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript |
| Data | PostgreSQL, Prisma |
| Auth | Better Auth (sessions, organizations, passkeys, two factor) |
| UI | Radix UI, dnd-kit, Recharts, TipTap, Lucide icons |
| Validation | Zod |
| Email | Resend |
| Tests | Vitest |

## Getting started

You need **Node.js 20.19 or newer** and **Docker** for the local database.

```bash
git clone https://github.com/amanuelmr/amr-hub.git
cd amr-hub
cp .env.example .env
npm install
npm run db:setup   # starts PostgreSQL 16 in Docker and runs migrations
npm run dev
```

Open the URL Next.js prints, sign up, and create your workspace. Each
workspace starts empty and can only see its own data.

In local development, notification emails are written to the server log
instead of being sent.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled database connection used by the app |
| `DIRECT_URL` | Direct connection used for migrations |
| `NEXT_PUBLIC_APP_URL` | Public URL, used in links and emails (required in production) |
| `BETTER_AUTH_SECRET` | Session secret, e.g. `openssl rand -base64 32` |
| `RESEND_API_KEY` | Sends verification, reset and notification emails |
| `EMAIL_FROM` | Sender address, e.g. `AMR Hub <no-reply@example.com>` |
| `CRON_SECRET` | Protects the scheduled jobs in production |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Build and run for production |
| `npm run lint` | Lint the code |
| `npm run test:run` | Run the test suite once |
| `npm run db:setup` | Start the local database and apply migrations |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
| `npm run db:down` | Stop the local database |

## Deployment

AMR Hub runs on Vercel or any Node.js host with a managed PostgreSQL database.
Three daily scheduled jobs handle notification emails, automation and emptying
the trash; they are defined in `vercel.json`. Setup, migrations, backups and
rollback are covered in the [deployment guide](docs/DEPLOYMENT.md).

A health check is available at `/api/health`.

## Project structure

```
src/app             Pages, layouts and API routes
src/app/components  Shared UI
src/app/data        Domain logic shared by the browser and server
src/server          Server side logic, validation and database access
prisma              Schema and migrations
docs                Deployment guide
```

## Contributing

Issues and pull requests are welcome. Before opening a pull request, make sure
`npm run lint`, `npm run test:run` and `npm run build` all pass.
