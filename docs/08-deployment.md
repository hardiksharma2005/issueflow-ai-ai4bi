# 08 · Deployment

> **Status:** verified locally (production build + `next start`) against a real Supabase project. Vercel deployment, Vercel Cron and GitHub have **not** been set up yet; the steps below are what to do, not a record of something already done.

## 1. Supabase (free tier)

1. [supabase.com](https://supabase.com) → **New project**. Pick a region near your users and save the **database password**.
2. **Project Settings → Data API**: copy the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`. Use the bare URL `https://<ref>.supabase.co`, not the `/rest/v1/` endpoint (the app strips a path if one is pasted, but scripts are simpler with the bare URL).
3. **Project Settings → API Keys**:
   - `anon` (legacy) or **publishable** (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (legacy) or a **secret** key (`sb_secret_…`) → `SUPABASE_SERVICE_ROLE_KEY` — server only, never commit, never prefix with `NEXT_PUBLIC_`.
4. **Connect** (top of the dashboard) → **Session pooler** URI → `SUPABASE_DB_URL`. Replace `[YOUR-PASSWORD]` with the password **including removing the square brackets**.
5. **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (later: your production URL)
   - Redirect URLs: `http://localhost:3000/auth/callback`, and later `https://<your-domain>/auth/callback`
6. **Authentication → Sign In / Providers → Email**: for a demo, turn **Confirm email** off. Supabase's built-in email sender allows only a few emails per hour and is meant for testing. For production, add custom SMTP (Authentication → Emails → SMTP settings) and turn confirmation back on.
7. Apply the schema and (optionally) demo data:

   ```bash
   npm run db:migrate      # needs SUPABASE_DB_URL
   npm run db:seed         # needs DEMO_PASSWORD; skip in production
   ```

   **Without a connection string** you can paste `database/migrations/0001…0005` into the **SQL Editor** one by one, in order. (`db:migrate` would then try to re-apply them, so stick to one method per database.)

8. Check: `npm run test:integration` should report 12 passed.

## 2. GitHub

The project is a local git repository with no remote yet.

```bash
# create an empty repository on github.com first (no README/licence), then:
git remote add origin https://github.com/<you>/issueflow-ai.git
git branch -M main
git push -u origin main
```

Before pushing, confirm no secrets are tracked:

```bash
git ls-files | grep -i env          # should list only .env.example
git log -p | grep -iE "sb_secret_|service_role|xai-" || echo "clean"
```

## 3. Vercel

### Option A — dashboard (recommended)

1. [vercel.com/new](https://vercel.com/new) → import the GitHub repository. Framework preset: **Next.js** (detected). Build command and output: defaults.
2. **Environment Variables** (Production, and Preview if you use previews):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | as in `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | as in `.env.local` |
   | `SUPABASE_SERVICE_ROLE_KEY` | as in `.env.local` — mark **Sensitive** |
   | `NEXT_PUBLIC_SITE_URL` | `https://<project>.vercel.app` (or your domain) |
   | `CRON_SECRET` | a new random string — mark **Sensitive** |
   | `AI_PROVIDER` | `mock`, `groq` or `grok` |
   | `GROQ_API_KEY`, `GROQ_MODEL` | only with `AI_PROVIDER=groq` — mark the key **Sensitive** |
   | `XAI_API_KEY`, `XAI_MODEL` | only with `AI_PROVIDER=grok` — mark the key **Sensitive** |

   `SUPABASE_DB_URL` and `DEMO_PASSWORD` are **not** needed on Vercel.

3. Deploy. Then in Supabase add `https://<project>.vercel.app/auth/callback` to Redirect URLs and set Site URL to the production URL.

### Option B — CLI

```bash
npm i -g vercel
vercel link
vercel env add SUPABASE_SERVICE_ROLE_KEY production   # repeat for each variable
vercel deploy --prod
```

### Function limits

- Import parsing and AI processing routes declare `maxDuration = 300` (5 min). Vercel's default timeout is 300 s on all plans with Fluid Compute.
- Request bodies are limited to 4.5 MB on Vercel; the app uploads files directly from the browser to Supabase Storage, so large exports are not affected.

## 4. Scheduled automations (Vercel Cron)

`vercel.json` registers four jobs (times in UTC):

| Path | Schedule |
|---|---|
| `/api/cron/daily-overdue-check` | `0 7 * * *` — daily 07:00 |
| `/api/cron/stale-issue-detection` | `30 7 * * *` — daily 07:30 |
| `/api/cron/weekly-project-summary` | `0 8 * * 1` — Mondays 08:00 |
| `/api/cron/import-failure-monitor` | `0 9 * * *` — daily 09:00 |

Vercel calls each path with `Authorization: Bearer <CRON_SECRET>` when the `CRON_SECRET` environment variable is set. Cron jobs run on **production deployments only**. On the Hobby plan each job may run at most once a day and the exact minute can drift by up to about an hour; all four schedules fit those limits.

After deploying, verify:

```bash
curl -i https://<project>.vercel.app/api/cron/daily-overdue-check                       # 401
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<project>.vercel.app/api/cron/daily-overdue-check   # 200 + summary
```

Then check **Automations** in the app (admin) for the logged run, and the **Cron Jobs** tab of the Vercel project.

## 5. Production checklist

- [ ] Confirm email **on** and custom SMTP configured
- [ ] Sign-ups disabled if the workspace should be invite-only
- [ ] `NEXT_PUBLIC_SITE_URL` and Supabase Site URL / Redirect URLs point to the production domain
- [ ] Demo data not seeded (or removed with `npm run db:reset-demo` then deleting demo users in Supabase Auth)
- [ ] `CRON_SECRET` set; cron endpoint returns 401 without it
- [ ] `AI_PROVIDER` decided; if `grok`, a spending limit set in the xAI console; if `groq`, the free-plan limits are acceptable for expected import volume
- [ ] First account registered by the intended admin (the first user becomes admin)
- [ ] Supabase backups: daily backups are included on paid plans; on the free plan export the database periodically
