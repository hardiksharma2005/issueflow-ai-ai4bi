# 13 · Troubleshooting

## Setup

| Symptom | Cause | Fix |
|---|---|---|
| Every page redirects to **/setup** | `NEXT_PUBLIC_SUPABASE_URL` or the anon/publishable key is missing | Fill `.env.local` and **restart** the server (`NEXT_PUBLIC_*` values are read at build/start time). On Vercel, add the variables and redeploy. |
| `npm run db:migrate` → `password authentication failed for user "postgres"` | Wrong database password in `SUPABASE_DB_URL`, often still wrapped in the placeholder's square brackets `[...]` | Use the password without brackets. Reset it under Project Settings → Database if forgotten. |
| `db:migrate` → `getaddrinfo ENOTFOUND db.<ref>.supabase.co` | The *direct* connection host is IPv6-only on many networks | Use the **Session pooler** URI from **Connect** (`…pooler.supabase.com:5432`). |
| `db:migrate` → `relation … already exists` | The SQL was already applied by hand in the SQL editor | Use one method per database. Either keep using the SQL editor for new migrations, or record the applied files: `insert into public._migrations (name) values ('0001_schema.sql'), …`. |
| `db:seed` → `list users: Invalid path specified in request URL` | Supabase URL includes `/rest/v1/` | Use the bare project URL `https://<ref>.supabase.co`. (The app tolerates it; older scripts didn't.) |
| `db:seed` → `Set DEMO_PASSWORD (min 8 characters)` | Missing `DEMO_PASSWORD` | Add it to `.env.local`. |
| `db:seed` says "Demo projects already exist" | Seed is idempotent for projects | `npm run db:reset-demo` to recreate them (users are kept; passwords reset to `DEMO_PASSWORD`). |
| Integration tests are **skipped** | No Supabase credentials in `.env.local` | Expected without a project. Configure Supabase to run them. |

## Sign-in and email

| Symptom | Cause | Fix |
|---|---|---|
| "Check your email to confirm" but no email arrives | Supabase's built-in sender is rate-limited (a few per hour) and meant for testing | For demos turn off **Confirm email** (Authentication → Sign In / Providers → Email). For production configure custom SMTP. |
| Email link opens **/login?error=link** ("That link is invalid or has expired") | Link already used or expired, or the redirect URL isn't allowed | Add `<site>/auth/callback` to Authentication → URL Configuration → Redirect URLs, and check `NEXT_PUBLIC_SITE_URL`. Request a new link. |
| Password reset link goes to localhost in production | Supabase **Site URL** or `NEXT_PUBLIC_SITE_URL` still `http://localhost:3000` | Update both to the production URL. |
| New user sees an empty app | New users are members with no project membership | An admin or a project manager adds them to a project (project page → Members), or changes their role on **Team**. |
| Nobody is admin | The first account to register becomes admin; it may have been a test account | In the SQL editor: `update public.profiles set role = 'admin' where email = 'you@example.com';` |
| "Could not reach the database. Please try again." | A request to Supabase failed (network, project paused, outage) | Retry. Free-tier Supabase projects **pause after a period of inactivity**; resume the project in the dashboard. |

## Imports

| Symptom | Cause | Fix |
|---|---|---|
| "No WhatsApp messages were found…" | The file is not a WhatsApp export (or a different export format) | Export from WhatsApp → Export chat. If it is an export, open an issue with an anonymised sample of the first lines. |
| Dates look off by some hours | Times in exports have no time zone; the browser's offset at import time is used | Import from a browser in the same time zone as the chat, or correct dates on approved issues. |
| "Date order is ambiguous… assumed day/month/year" | Every date in the chat has day ≤ 12 | Check a few messages; if they are month-first the chat is short enough to fix by hand. |
| Import status **Duplicate** | The same conversation was already imported into this project | Open the original import (linked in the message). Delete it first to import again. |
| Import status **Failed** after a network hiccup | A request to Supabase failed mid-way | Click **Retry extraction** / **Retry AI processing**. Retries clean up partial results. |
| "AI processing is limited to 15 imports per hour" | Per-user rate limit | Wait, or raise `AI_RUNS_PER_HOUR` in `lib/imports/pipeline.ts`. |
| "Process with AI" is disabled with a message about XAI_API_KEY / GROQ_API_KEY | Provider selected without its key, or a key in the wrong variable (Groq keys start `gsk_`, xAI keys `xai-`) | Put the key in the matching variable (`AI_PROVIDER=groq` + `GROQ_API_KEY`, or `AI_PROVIDER=grok` + `XAI_API_KEY`), or set `AI_PROVIDER=mock`. There is intentionally no fallback. |
| "Groq rate limit reached" | Free-plan tokens-per-minute limit | The app already waits and retries; for very large chats wait a minute and click **Retry AI processing**, or upgrade the Groq plan. |
| "Grok API rejected the API key (check XAI_API_KEY and account credits)" | Invalid key or no credits | Check the key and billing in the xAI console. |
| "Grok API rate limit or spending limit reached" | xAI limits | Retry later or raise the limit in the xAI console. |
| A file is listed as skipped in Import notes | Unsupported type, too large, or its content doesn't match its extension | Upload a supported type (see [04](04-whatsapp-processing.md#server-side-checks)). |
| Screenshot not attached to any message | Its name isn't referenced in the chat and has no timestamp | It is kept as loose evidence; attach it while reviewing the draft. |

## Deployment

| Symptom | Cause | Fix |
|---|---|---|
| Cron jobs never run | Cron only runs on **production** deployments; `CRON_SECRET` missing (endpoint returns 503) | Deploy to production, set `CRON_SECRET`, check the Vercel project's Cron Jobs tab and the Automations page. |
| Cron runs about an hour late | Vercel Hobby plan schedules within the hour | Expected on Hobby; use Pro for exact timing. |
| Large imports time out | Function limit | Import routes allow 300 s. Split very large chats (tens of thousands of messages), or with Grok use a faster model. |
| Upload fails with "Payload too large" | A file sent through a Server Action | Uploads must go directly to storage (the wizard and attachments already do); Server Actions are limited to 4 MB. |

## Development

| Symptom | Cause | Fix |
|---|---|---|
| Type errors on `PageProps` / `RouteContext` after adding a route | Route types not regenerated | `npm run typecheck` (runs `next typegen`). |
| "Only async functions are allowed to be exported in a 'use server' file" | A type or helper exported from `lib/actions/*` | Move it to a regular module in `lib/`. |
| Lint: "Cannot call impure function during render" / "Cannot reassign variable after render completes" | React compiler rules | Move `Date.now()` and similar into helpers or effects; build arrays with `map`/`reduce` without mutating outer variables. |
| A page suddenly scrolls sideways on mobile | A grid without explicit columns grows to its widest child | Use `grid grid-cols-1` (or `minmax(0,1fr)` tracks) and `min-w-0` on flex children. `npm run test:e2e` checks every page at 390 px. |
| `npm run test:e2e` can't launch a browser | playwright-core uses an installed browser | Install Edge or Chrome, or set `E2E_BROWSER=chrome`. |
| e2e fails at "re-importing the same chat" or "7 drafts" on a second run | The previous run already imported the sample | `npm run db:reset-demo` before each run. |
