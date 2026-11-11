# 02 · Architecture

## Overview

```
Browser (React 19, shadcn/ui)
   │  Server Components render pages; Server Actions mutate; fetch() for long-running import steps
   │  Direct uploads to Supabase Storage (signed-in user, RLS-checked path)
   ▼
Next.js 16 on Vercel (Node.js runtime)
   ├─ proxy.ts ............ refreshes the Supabase session, keeps signed-out users out
   ├─ app/(app)/* ......... pages (Server Components) — query Supabase as the signed-in user
   ├─ lib/actions/* ....... Server Actions — Zod-validated, run as the signed-in user
   ├─ app/api/imports/* ... parse + AI processing (up to 300 s)
   ├─ app/api/reports/* ... CSV export
   └─ app/api/cron/* ...... scheduled jobs, bearer-secret protected, service role
   ▼
Supabase
   ├─ Postgres ........ tables, triggers, RLS policies, SECURITY INVOKER review RPCs
   ├─ Auth ............ email + password, password reset
   └─ Storage ......... private "evidence" bucket, RLS by project folder
   ▼
xAI Grok (optional) ... POST /v1/responses with strict JSON schema — server only
```

### Key decisions

| Decision | Why |
|---|---|
| **Queries run as the user, not the service role.** Pages and actions use the user's session (`lib/supabase/server.ts`). | RLS becomes the single source of truth for authorization. A bug in a page cannot leak another project's data. |
| **Service role only for cron, seeding and inviting.** (`lib/supabase/admin.ts`, `server-only`) | Jobs run without a user; they are protected by the cron secret and are read-only on issues. |
| **Review operations are Postgres functions** (`approve_issue_draft`, `merge_drafts`, …) declared `SECURITY INVOKER`. | Approval must atomically create the issue, link evidence, mark the draft and update the import. Running as the invoker keeps RLS in force. |
| **Direct-to-storage uploads.** | Vercel functions accept at most 4.5 MB request bodies; exports with media are often larger. The browser uploads to `{project}/imports/{import}/raw/…`; storage policies only accept writes into a project's folder from members of that project, and only managers can create the import record that the server later reads from. |
| **Import split into two server steps** (`parse`, `process`) with their own routes and `maxDuration = 300`. | Each step can be retried independently and shows its own failure state. |
| **Provider interface for AI** (`lib/ai/types.ts`). | Mock and Grok are interchangeable; validation is provider-independent. |
| **No caching of user data.** `cacheComponents` is off; data pages are dynamic. | Every request reflects the current permissions. |

## Import pipeline

```
createImport (Server Action)
  · checks the user manages the project
  · inserts imports row (status uploaded), returns per-file storage paths
browser → Storage upload (each file)
POST /api/imports/:id/parse  → lib/imports/pipeline.ts › parseImport
  · lists raw files, downloads, verifies magic bytes, expands ZIP (entry + size caps)
  · sha256 of chat text → duplicate check (unique index per project) → status duplicate
  · parseWhatsAppChat → source_messages (batches of 500)
  · matchMedia → media uploaded to …/media/, attachments rows, missing files noted
  · status parsed
POST /api/imports/:id/process → processImport
  · rate limit (15 AI runs / user / hour), clears drafts of a previous failed run
  · builds ExtractionInput with opaque refs (m12, a3) — no database ids reach the model
  · runExtraction: batches of 150 messages, one retry, validateExtraction, duplicates
  · inserts issue_drafts (with raw_output and prompt version), stores attachment findings
  · status review, audit event import.ai_processed
Review (Server Actions → RPCs)
  · approve / reject / link to existing issue / merge drafts
  · refresh_import_status → completed when nothing is pending
```

Failures set `status = failed` with a user-safe `error_message`; the import page offers **Retry**.

## Folder layout

```
app/
  (auth)/              login, register, forgot-password, reset-password
  (app)/               signed-in pages (layout = sidebar + topbar)
  api/                 cron, imports (parse/process), reports (CSV)
  auth/callback/       Supabase email-link handler
  setup/               shown when Supabase env vars are missing
components/
  app-shell/ dashboard/ issues/ imports/ projects/ automations/ team/ settings/ shared/
  ui/                  shadcn/ui primitives (generated)
lib/
  actions/             Server Actions ("use server")
  ai/                  providers, prompt, schema, validation, duplicates
  whatsapp/            parser, media matching
  imports/pipeline.ts  parse + process
  automation/          cron parsing, job implementations
  validation/          Zod schemas, file checks
  supabase/            server, browser and admin clients
  analytics.ts reports.ts queries.ts issue-query.ts search.ts format.ts domain.ts env.ts auth.ts
database/
  migrations/          0001 schema … 0005 automation jobs
  seed/seed-demo.ts
public/demo/           sample WhatsApp export, screenshots, ZIP
scripts/               db-migrate.ts, generate-demo-assets.mjs
tests/                 unit/, integration/
proxy.ts               Next.js 16 request proxy (formerly middleware)
vercel.json            cron schedule
```

## Request authentication path

1. `proxy.ts` runs on every page request (not on `/api`), calls `supabase.auth.getClaims()` to validate and refresh the JWT, and redirects signed-out users to `/login?next=…`.
2. Pages call `requireViewer()` (`lib/auth.ts`), which loads the profile once per request (React `cache`).
3. Server Actions call `assertViewer(roles)` for a fast, friendly rejection, then perform the operation as the user, so RLS decides.
4. API routes authenticate themselves: import routes use the user session and check the role; cron uses `Authorization: Bearer CRON_SECRET` with a timing-safe comparison.
