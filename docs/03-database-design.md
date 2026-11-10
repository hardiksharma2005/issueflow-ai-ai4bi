# 03 · Database design

Postgres on Supabase. Schema, functions and policies live in `database/migrations/` and are applied in order by `npm run db:migrate` (tracked in `public._migrations`).

| File | Contents |
|---|---|
| `0001_schema.sql` | Extensions (`pgcrypto`, `pg_trgm`), enums, tables, indexes |
| `0002_functions_triggers.sql` | Authorization helpers, profile/issue triggers, activity history, audit triggers, review RPCs, search |
| `0003_rls_policies.sql` | Row Level Security on every table, function privileges |
| `0004_storage.sql` | Private `evidence` bucket and storage policies |
| `0005_automation_jobs.sql` | The four automation job definitions |

## Entity overview

```
auth.users 1─1 profiles (role: admin | manager | member)
profiles ─< project_members >─ projects (key, issue_counter, is_demo)
projects ─< issues (number unique per project) ─< comments
                 │                              ─< issue_activity   (trigger-written history)
                 │                              ─< attachments      (also per import / message)
                 └──< issue_source_messages >── source_messages
projects ─< imports (content_hash) ─< source_messages (immutable originals, seq)
                                    ─< issue_drafts (AI output, pending → approved | rejected | merged)
automation_jobs ─< automation_logs
audit_logs (append-only)
```

## Tables

| Table | Purpose and notable columns |
|---|---|
| `profiles` | One per auth user, created by the `on_auth_user_created` trigger. `role` defaults to `member`; the first user ever becomes `admin`. Role is never read from sign-up metadata. |
| `projects` | `key` must match `^[A-Z][A-Z0-9]{1,9}$`. `issue_counter` feeds per-project issue numbers. `is_demo` marks seeded data so `db:reset-demo` can remove it. |
| `project_members` | Membership drives every RLS check. The project creator is added automatically. |
| `imports` | One upload session. `status`: uploaded → parsing → parsed → processing → review → completed (or failed / duplicate). `content_hash` (sha256 of the chat text) has a **partial unique index per project**, excluding failed and duplicate attempts. `ai_provider`, `ai_model`, `ai_simulated` record what produced the drafts. |
| `source_messages` | The original messages exactly as parsed: `seq`, `sender` (null when unknown), `sent_at` (null when unparseable), `raw_timestamp`, `body`, `is_system`, `attachment_name`, `attachment_missing`. Never edited. Trigram index for search. |
| `issues` | Approved records. `number` unique per project; `reporter_name` holds an external reporter (WhatsApp sender); `source` = `manual` or `whatsapp_import`; `resolved_at` maintained by trigger. Trigram indexes on title and description. |
| `issue_source_messages` | Evidence links between an issue and the messages it came from. |
| `comments` | 1–10,000 characters, author-editable. |
| `attachments` | Metadata for objects in the `evidence` bucket. Can belong to an issue, an import, and/or a source message. `ai_description` stores what the AI saw in an image. |
| `issue_drafts` | AI output kept apart from issues. Evidence as `source_message_ids` / `attachment_ids`, `duplicate_candidates` (JSON), `confidence`, `is_simulated`, `raw_output` (`{prompt_version, ai_result}`) for auditability, review fields. |
| `issue_activity` | Per-issue history (created, status/priority/assignee/due changes, comments, attachments). Written only by `SECURITY DEFINER` triggers; no insert policy. |
| `automation_jobs` / `automation_logs` | Job definitions (schedule mirrors `vercel.json`, `enabled`, JSON `config`) and one log row per run with `trigger` (`cron`/`manual`), status, summary and result. |
| `audit_logs` | Append-only trail of sensitive changes. Admin-readable only. |

## Triggers and functions

**Authorization helpers** (`SECURITY DEFINER`, `search_path = ''`, so policies can call them without recursion):

- `current_app_role()`, `is_admin()`
- `is_project_member(project)` — admins count as members of every project
- `can_manage_project(project)` — admin, or a manager who is a member
- `can_view_issue(issue)`, `can_manage_issue(issue)` (in 0003)

**Profiles**
- `handle_new_user` — creates the profile; first user → admin.
- `protect_profile_update` — only admins change roles; email is immutable; the last admin cannot be demoted.

**Issues**
- `a_issues_before_insert` — assigns `number` from the project counter (row lock), validates the assignee is a project member, sets `resolved_at`.
- `a_issues_before_update` — issues cannot move between projects; `number`, `created_by` and `created_at` are immutable; **non-managers may change only `status`** (raises "Members can only change the status of issues assigned to them"); validates assignee; maintains `resolved_at` and `updated_at`.
- `issues_activity`, `comments_activity`, `attachments_activity` — write history rows.

**Audit**
- `audit_row_change` — generic trigger on projects, members, issues, comment deletes, import status, draft status, role changes, automation runs and job changes. Long or sensitive text fields (`description`, `body`, `raw_output`, `parse_warnings`, `result`) are recorded only as "changed", never copied.
- `log_audit_event(action, details)` — lets the app record events that are not row changes. Only a whitelist is accepted: `auth.login`, `auth.logout`, `auth.password_reset`, `report.export`, `import.ai_processed`, `import.parsed`.

**Review RPCs** (`SECURITY INVOKER` — they run with the caller's RLS):
- `approve_issue_draft(draft, title, description, category, priority, assignee, due_date)` — creates the issue, links source messages and attachments, marks the draft approved. Rejects drafts already reviewed ("already been reviewed").
- `reject_issue_draft(draft)`
- `merge_draft_into_issue(draft, issue)` — links the draft's evidence to an existing issue and adds a comment.
- `merge_drafts(target, source)` — combines evidence of two drafts.
- `refresh_import_status(import)` — marks the import completed once no drafts are pending.

**Search** — `search_all(query, limit)` searches projects, issues, comments and source messages with `ILIKE` (LIKE wildcards in the query are escaped), running as the caller so RLS limits the results.

## Row Level Security summary

RLS is enabled on every table. `anon` has no access to any table or function (`revoke execute … from public, anon`).

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| profiles | self, admins/managers, people sharing a project | trigger only | self (role guarded by trigger) or admin | via auth admin API |
| projects | members | admins | managers of the project | admins |
| project_members | members | managers | — | managers |
| imports | members | managers (as creator) | managers | managers |
| source_messages | members | managers | — | managers |
| issues | members | managers | managers, or the assignee (status only, enforced by trigger) | managers |
| issue_source_messages | issue viewers | issue managers | — | issue managers |
| comments | issue viewers | issue viewers as author | author | author or manager |
| attachments | members | members as uploader | managers | uploader or manager |
| issue_drafts | **managers only** | managers | managers | managers |
| issue_activity | issue viewers | triggers only | — | — |
| automation_jobs | everyone signed in | — | admins | — |
| automation_logs | admins | service role | — | — |
| audit_logs | admins | triggers / whitelisted RPC | — | — |

"Managers" above always means *admin, or a manager who is a member of that project*.

### Storage

Bucket `evidence`: private, 25 MB per object, MIME allow-list (images, PDF, text/CSV, ZIP, Office documents, MP4, common audio). Object paths start with the project id (`{project}/issues/{issue}/…`, `{project}/imports/{import}/raw|media/…`). Policies:

- read and upload: members of the project in the first path segment
- delete: managers of that project

Files are served to the browser through short-lived signed URLs.

## Deleting data

Postgres cascades remove a project's issues, imports, messages, drafts and history. Storage objects are not cascaded, so the delete actions collect the affected object paths first and remove them after the rows are gone (`deleteProject`, `deleteImport`). Approved issues keep their evidence when an import is deleted.
