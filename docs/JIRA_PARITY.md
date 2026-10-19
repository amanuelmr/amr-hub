# Jira parity checklist

What Jira Cloud (Software) offers, what AMR Hub has today, and what still needs work.
Out of scope by decision: Rovo / AI, paid plans, Confluence, Marketplace apps, Jira Service Management, mobile apps.

**Status:** ✅ done and checked · 🟡 exists but incomplete or not Jira-like · ❌ missing
**Checked:** 🌐 seen working in the browser · 🔌 tested through the API only

## 1. App shell and navigation

| Jira feature | Status | Notes |
|---|---|---|
| Top bar: search, + Create, notifications, help, settings, profile | ✅ 🌐 | |
| Sidebar: For you, Recent, Starred, Projects, Filters, Dashboards, Teams | ✅ 🌐 | Also Roadmap, Goals, People, Overview, Issues |
| Project header with view tabs and "…" menu | ✅ 🌐 | |
| Keyboard shortcuts and `?` help | ✅ 🌐 | |
| Mobile layout | 🟡 | Built, never checked at phone width |

## 2. Projects

| Jira feature | Status | Notes |
|---|---|---|
| Create project from Scrum / Kanban template | ✅ 🌐 | |
| Projects directory: search, type filter, star | ✅ 🌐 | |
| Project details (name, key, lead, avatar colour) | ✅ | |
| Access: Open / Limited / Private and project roles | ✅ 🔌 | Access tab not seen in browser |
| Archive and trash (restore within 60 days) | ✅ 🔌 | Screens not seen in browser |
| Change project key | ❌ | Jira allows it; ours is fixed |

## 3. Work items (issues)

| Jira feature | Status | Notes |
|---|---|---|
| Epic / Story / Task / Bug / Subtask, custom work types | ✅ 🔌 | |
| Issue view: modal, side panel, full page | ✅ 🌐 | |
| Fields: assignee, reporter, labels, parent, sprint, fix version, components, story points, priority, dates, team, goal, environment | ✅ 🌐 | |
| Child items, linked items, attachments with preview | ✅ 🌐 | |
| Comments: rich editor, edit/delete, reactions, mentions | ✅ 🔌 | Reactions not seen in browser |
| Activity tabs: All / Comments / History / Work log | ✅ 🌐 | |
| Time tracking and log work | ✅ 🔌 | |
| Watch, vote, share, flag | ✅ 🔌 | |
| Clone, move, split, delete, archive | ✅ 🌐 | |
| Issue-level security (hide single items) | ❌ | Access is per project only |

## 4. Create, bulk, import and export

| Jira feature | Status | Notes |
|---|---|---|
| Create dialog in Jira field order, "Create another" | ✅ 🌐 | |
| Bulk change (transition, assign, labels, sprint, delete…) | ✅ 🔌 | |
| CSV import with column and value mapping | ✅ 🔌 | |
| CSV / JSON export | ✅ 🔌 | |

## 5. Board

| Jira feature | Status | Notes |
|---|---|---|
| Columns from workflow, drag and drop, WIP limits | ✅ 🌐 | |
| Swimlanes: assignee, epic, priority, subtasks, queries | ✅ 🌐 | |
| Quick filters (built-in and JQL), card layout, card colours | ✅ 🔌 | Settings screens not seen in browser |
| Card actions menu, insights panel, parallel sprints, Kanban release | ✅ 🔌 | |
| Several boards per project with a JQL filter | ✅ 🌐 | |

## 6. Backlog and sprints

| Jira feature | Status | Notes |
|---|---|---|
| Sprint sections, ranking by drag, inline create | ✅ 🌐 | |
| Create / start / complete / edit / delete sprint | ✅ 🔌 | |
| Epic panel, versions panel, bulk actions | ✅ 🔌 | |
| Issue side panel | ✅ 🌐 | |

## 7. Timeline, roadmap and other project views

| Jira feature | Status | Notes |
|---|---|---|
| Timeline with drag, zoom, sprint row | ✅ 🌐 | |
| Dependency arrows with date conflicts | ✅ 🌐 | |
| Cross-project roadmap (from Plans) | ✅ 🌐 | |
| Calendar | ✅ | Not re-checked after later changes |
| List view with inline edit and custom field columns | ✅ 🌐 | |
| Summary page | ✅ 🌐 | |
| Forms | ✅ 🔌 | Builder not seen in browser |

## 8. Search and filters

| Jira feature | Status | Notes |
|---|---|---|
| JQL with autocomplete, functions, ORDER BY | ✅ 🔌 | |
| Search page: list and detail views, column chooser, export | ✅ 🌐 | |
| Basic mode: Project, Type, Status, Assignee, + More fields | ✅ 🌐 | More adds Priority, Labels, Reporter, Sprint, Created |
| Default filters (My open work items, Reported by me, Viewed / Created / Resolved / Updated recently, All, Open, Done) | ✅ 🌐 | Uses new issueHistory() and lastViewed in JQL |
| Save filter, Save, Save as, rename, description, Edited badge | ✅ 🌐 | |
| Filter sharing: viewers and editors (private, workspace, project, team, user) | ✅ 🌐 | Teams stand in for Jira groups; private filters of others are never listed |
| Filters directory: name, owner, viewers, editors, starred count, actions | ✅ 🌐 | Copy, change owner, delete; stars stored on the server |
| Filter subscriptions (email) | ✅ 🔌 | |

## 9. Dashboards and reports

| Jira feature | Status | Notes |
|---|---|---|
| Dashboards with configurable gadgets | ✅ | Not re-checked after later changes |
| Dashboard sharing (viewers and editors) | ❌ | Always private |
| Reports: burndown, burnup, velocity, sprint report, CFD, control chart, created vs resolved, pie, version, epic, time tracking, workload | ✅ | Not re-checked after later changes |

## 10. Releases and components

| Jira feature | Status | Notes |
|---|---|---|
| Versions: create, release, archive, release notes | ✅ 🔌 | |
| Components with lead | ✅ 🔌 | |

## 11. Configuration

| Jira feature | Status | Notes |
|---|---|---|
| Custom workflows: statuses, categories, transitions | ✅ 🔌 | |
| Custom work types with hierarchy levels | ✅ 🔌 | |
| Custom fields (12 types, global or per project) | ✅ 🌐 | |
| Automation: triggers, conditions, actions, smart values, run log, scheduled rules | ✅ 🔌 | Rule builder not seen in browser |

## 12. Collaboration and notifications

| Jira feature | Status | Notes |
|---|---|---|
| Notification inbox (Direct / Watching) | ✅ 🔌 | |
| Notification preferences (in app / email, daily digest) | ✅ 🔌 | |
| Live updates when others edit | ✅ 🔌 | Needs a second real account to check by hand |

## 13. People, teams and goals

| Jira feature | Status | Notes |
|---|---|---|
| People directory and profiles | ✅ 🔌 | |
| Teams with members and team field on issues | ✅ 🔌 | |
| Goals with status updates and linked work | ✅ 🔌 | |

## 14. Administration and security

| Jira feature | Status | Notes |
|---|---|---|
| Members, invitations, roles (owner / member / viewer) | ✅ | |
| 2FA, passkeys, recovery codes, sessions | ✅ | |
| Audit log, API tokens, REST API, webhooks | ✅ 🔌 | |
| User groups (for sharing and permissions) | ❌ | Jira shares filters and dashboards with groups |
| SSO / SAML | ❌ | Atlassian Guard feature, not planned |

## Cleanup and modification plan

Work in this order; each step is finished, checked in the browser and committed before the next.

1. ✅ **Filters, the Jira way.** Done.
   - Default filters.
   - Viewers and editors sharing.
   - Description, Save as, copy, change owner.
   - Server-side stars with a starred count.
   - A filter details panel on the Search page.
   - Basic mode with Type and "+ More".
2. **Dashboard sharing.** Uses the same viewers/editors model as filters.
3. **Browser pass over screens only tested through the API:** access, trash, archive, automation builder, board settings, forms, reactions, notifications, calendar, reports, dashboards. Fix what's broken or unlike Jira.
4. **Mobile pass at phone width** for the main screens.
5. **Remaining gaps, if wanted:** issue-level security, user groups, changing a project key.
