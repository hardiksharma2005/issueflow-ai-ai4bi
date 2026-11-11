# 01 · Product requirements

## Problem

Small agencies, facility teams and support desks receive most of their client issues in WhatsApp groups. Reports are scattered across hundreds of messages, mixed with greetings and status chatter, and the screenshots that prove the problem sit in a separate media folder. Turning a week of chat into a task list is slow manual work, and things get lost.

## Solution

IssueFlow AI imports a WhatsApp export, proposes one issue draft per distinct problem with the original messages and screenshots attached as evidence, and lets a manager approve, edit, merge or reject each draft. Approved issues are tracked like in any issue tracker.

Principles:

1. **Human approval is mandatory.** AI output is a draft. Nothing reaches the issue list without a person approving it.
2. **Evidence over summaries.** Every draft links to the exact source messages and files; reporter and date always come from the source, never from the model.
3. **Untrusted input.** Conversation text is data. Instructions inside it ("ignore previous instructions…") are never followed.
4. **Free to run.** The complete product works without any paid API. Simulated results are always labelled as such.
5. **Authorization in the database.** Roles and project membership are enforced with Postgres Row Level Security, not only in the UI.

## Users and roles

| Role | Can |
|---|---|
| **Admin** | Everything: create/delete projects, manage all members and roles, run and configure automations, read the audit log and automation logs. The first account to register becomes admin. |
| **Manager** | In projects they belong to: create/edit/delete issues, manage project members, import conversations, review AI drafts, export reports. |
| **Member** | In projects they belong to: read everything except AI drafts, change the **status** of issues assigned to them, comment, upload attachments. |

New sign-ups join as members. Only an admin can change roles, and the last admin cannot be demoted.

## Features

### Issue tracking
- Projects with a short key (`BLOOM`), client name, status and members; issues are numbered per project (`BLOOM-12`).
- Issue fields: title, description, category (bug, feature request, performance, UI/UX, maintenance, customer complaint, operations, other), priority (critical/high/medium/low), status (open, in progress, blocked, in review, resolved, closed), assignee, due date, reporter, source (manual or WhatsApp import).
- Views: filterable/sortable table with pagination, Kanban board with drag-and-drop (and a keyboard-accessible "Move to" menu), issue detail page, **My Tasks**.
- Comments, attachments (direct-to-storage upload, type sniffing), automatically recorded activity history.

### WhatsApp import (wizard)
1. Choose project → 2. upload `.txt`/`.zip` + screenshots/documents → 3. client-side validation (type, size, count) → 4. upload directly to private storage → 5. server-side extraction: unzip, verify file signatures, detect duplicates by content hash, parse messages, match media → 6. conversation preview → 7. AI processing → 8. validation and duplicate detection → 9. human review: edit, approve, reject, link to an existing issue, merge drafts → 10. import completes when no drafts are pending.

### Insight
- Dashboard with live KPIs, created-vs-resolved burn-up, resolution trend, issues by status/priority/category, "needs attention" list and recent imports. Every chart has a table view.
- Global search (Ctrl/⌘ K and a search page) across projects, issues, comments and imported messages, limited to what the user may see.
- Reports: open issues, overdue issues, team workload, project progress, issue resolution (time to resolve); CSV export.

### Automations
Daily overdue check, stale-issue detection, weekly project summary and import-failure monitor, triggered by Vercel Cron with a shared secret or manually by an admin. Every run is logged.

### Trust and safety
Audit log of sensitive changes (admin-only), AI guardrails (schema-validated output, evidence required, prompt-injection resistant prompt, rate limit), "Simulated" labels for mock output.

## Non-goals (this version)

- Live WhatsApp integration (WhatsApp Business API). Imports are file-based.
- Email/Slack notifications. Notifications are in-app.
- Transcribing voice notes or reading documents.
- Multi-tenant workspaces. One deployment = one workspace.

## Acceptance criteria (summary)

- A user with no paid API can sign up, import the sample conversation, review drafts and see approved issues on the dashboard.
- A member cannot read drafts, change issue fields other than status, see other projects, read audit logs or run automations — verified against the database, not only the UI ([10-testing.md](10-testing.md)).
- Importing the same conversation twice into a project is blocked.
- Mock results never claim to come from Grok.
