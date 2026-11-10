# 09 · Automation

Code: `lib/automation/jobs.ts` (job logic), `lib/automation/cron.ts` (cron parsing for display), `app/api/cron/[job]/route.ts` (HTTP trigger), `components/automations/automation-controls.tsx` (UI). Job rows: `database/migrations/0005_automation_jobs.sql`. Schedule: `vercel.json`.

## Jobs

| Id | Schedule (UTC) | What it does | Config |
|---|---|---|---|
| `daily-overdue-check` | daily 07:00 | Lists unresolved issues past their due date with project, assignee and days overdue, plus a count per assignee. | — |
| `stale-issue-detection` | daily 07:30 | Finds unresolved issues not updated for N days. | `{ "stale_days": 7 }` |
| `weekly-project-summary` | Mondays 08:00 | Per project: open, in progress, blocked (with the blocked issues listed), in review, created and resolved in the last 7 days. | — |
| `import-failure-monitor` | daily 09:00 | Lists imports that failed in the lookback window, with file names and error messages. | `{ "lookback_hours": 24 }` |

Jobs are **read-only on issues**: they report, they don't change statuses or assignees. Results are recorded in the automation log (Automations page, admin) with a summary and the full JSON result.

The in-app notifications (bell in the top bar: my overdue issues, imports waiting for review, failed imports in the last 7 days) and the dashboard "Needs attention" list are computed live from the data on each page load, so they don't depend on a job having run. Delivering job results by email or Slack is not implemented.

## Triggers

| Trigger | How | Authorization |
|---|---|---|
| **Cron** | Vercel Cron → `GET /api/cron/<job-id>` | `Authorization: Bearer <CRON_SECRET>`, compared in constant time. If `CRON_SECRET` is not set the endpoint answers **503** and does nothing. Unknown job → 404. |
| **Manual** | Automations page → **Run now** | Admins only (Server Action + `assertViewer(["admin"])`) |

A disabled job (toggle on the Automations page, admin only) is skipped when triggered by cron: the endpoint answers `{"status":"skipped"}` and nothing is logged. **Run now** still works for a disabled job.

Jobs run with the service-role client because no user is present. That is why they are limited to reading and logging, and why their logs are admin-only (they span all projects).

## Logging

Each run inserts an `automation_logs` row (`trigger` = `cron`|`manual`, `triggered_by`, `status` running → success|failed, `summary`, `result`, `error`, timings) and updates `automation_jobs.last_run_at` / `last_status`. Runs also appear in the audit log.

## Local testing

```bash
# with the dev or production server running
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily-overdue-check
# {"logId":"…","status":"success","summary":"4 overdue issue(s) across 3 project(s)"}
```

`npm run db:seed` also executes all four jobs once (recorded as manual runs) so the Automations page has history.

## Adding a job

1. Insert a row in a new migration (`id`, `name`, `description`, `schedule`, `config`).
2. Add the id to `JOB_IDS` and a case in `runJob` (`lib/automation/jobs.ts`) returning `{ summary, result }`.
3. Add the path and schedule to `vercel.json` (Hobby: at most once per day).
4. Add a unit test for any pure logic; trigger it manually from the Automations page to check the log.
