# IssueFlow AI

Turn WhatsApp support conversations into a reviewed, trackable issue list.

Upload a WhatsApp chat export (`.txt` or `.zip` with media), screenshots and documents. IssueFlow AI parses the conversation, matches media to the messages that sent them, asks an AI model to propose issue drafts with evidence, flags likely duplicates, and puts every draft in front of a human. **Nothing becomes an issue until a manager approves it.** Approved issues then live in a normal tracker: table and Kanban views, comments, attachments, activity history, dashboards, CSV reports and scheduled automations.

Runs completely free in **demo mode**: a deterministic local `MockAIProvider` replaces the AI model and every result it produces is labelled **Simulated**. For real model output use **GroqCloud** (free plan) or **xAI Grok** (paid) by setting two environment variables.

| | |
|---|---|
| Stack | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Recharts |
| Backend | Supabase: Postgres with Row Level Security, Auth, Storage |
| AI | GroqCloud `openai/gpt-oss-120b` (free plan), xAI Grok (Responses API) or the free MockAIProvider — all with strict JSON-schema output |
| Validation | Zod on every server boundary; AI output validated against the source conversation |
| Scheduling | Vercel Cron → `/api/cron/[job]` with a bearer secret |
| Tests | Vitest: 58 unit tests, 12 integration tests against a real Supabase project; 36-check browser suite (playwright-core) |

## Quick start (free mode, ~10 minutes)

Requirements: Node.js 22+, a free [Supabase](https://supabase.com) project (no credit card).

```bash
npm install
cp .env.example .env.local      # then fill in the Supabase values — see below
npm run db:migrate              # creates tables, policies, functions, storage bucket
npm run db:seed                 # demo users, 3 projects, 24 issues, a past import
npm run dev                     # http://localhost:3000
```

Values for `.env.local` (full walkthrough in [docs/08-deployment.md](08-deployment.md)):

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API → Project URL (`https://<ref>.supabase.co`, no path) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API Keys → `anon`/`publishable` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → `service_role`/`secret` key — **server only** |
| `SUPABASE_DB_URL` | **Connect** → Session pooler URI, with your database password (no `[ ]`) — only used by `db:migrate` |
| `CRON_SECRET` | any random string ≥ 16 chars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DEMO_PASSWORD` | password you choose for the demo users (≥ 8 chars) |
| `AI_PROVIDER` | `mock` (free, default), `groq` (with `GROQ_API_KEY`) or `grok` (with `XAI_API_KEY`) |

In the Supabase dashboard also set **Authentication → URL Configuration**: Site URL `http://localhost:3000`, redirect URL `http://localhost:3000/auth/callback`, and (for demos) turn off **Confirm email** under Authentication → Sign In / Providers → Email.

### Demo logins

After `npm run db:seed`, sign in with any of these and the `DEMO_PASSWORD` from your `.env.local`:

| Email | Role | Sees |
|---|---|---|
| `admin@issueflow.example` | Admin | Everything, team management, automations, audit log |
| `manager@issueflow.example` | Manager | BLOOM and RVSD projects; imports and AI review (not CARE — useful for showing project isolation) |
| `member@issueflow.example` | Member | RVSD and CARE; can change status of issues assigned to them and comment |
| `daniel@issueflow.example` (AI4BI Member 2) · `sara@issueflow.example` (AI4BI Member 3) | Member | BLOOM · BLOOM and CARE |

The 5-minute demo is in [docs/12-demo-script.md](12-demo-script.md). The short version: sign in as the manager → **Imports → New import** → pick *BLOOM* → **Use sample WhatsApp data** → **Upload & extract messages** → **Process with AI** → review the 7 drafts, approve one, link the out-of-stock one to its existing duplicate.

## Using a real AI model

**Groq and Grok are different companies** with different keys — use the variables that match your key.

| | GroqCloud ([console.groq.com](https://console.groq.com)) | xAI Grok ([console.x.ai](https://console.x.ai)) |
|---|---|---|
| Variables | `AI_PROVIDER=groq`, `GROQ_API_KEY=gsk_…`, optional `GROQ_MODEL` (default `openai/gpt-oss-120b`) | `AI_PROVIDER=grok`, `XAI_API_KEY=xai-…`, optional `XAI_MODEL` (default `grok-4.7`) |
| Cost | Free plan, rate-limited (≈ 8K tokens/min on gpt-oss models) | Billed per token |
| Screenshots | Not analysed (text-only model); kept as evidence | Read by the model (JPEG/PNG) |
| Verified | Yes — sample chat → 7 drafts in ~16 s | Not called yet |

Grok usage is **billed per token by xAI** (see [docs/05-ai-integration.md](05-ai-integration.md) for current pricing and a cost estimate per import). The app never falls back from Grok to the mock or the other way round: if `AI_PROVIDER=grok` and the key is missing, AI processing is disabled with an explanatory message. The API key is only read on the server.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server / production build / production server |
| `npm run lint` · `npm run typecheck` | ESLint · route type generation + `tsc --noEmit` |
| `npm test` | Unit tests (parser, AI validation, mock extraction, duplicates, CSV, cron) |
| `npm run test:integration` | RLS and database guardrail tests against the Supabase project in `.env.local` (creates and deletes its own data) |
| `npm run test:e2e` | Browser smoke test against a running app with demo data (Edge or Chrome); run `db:reset-demo` afterwards |
| `npm run db:migrate` | Applies `database/migrations/*.sql` in order; safe to re-run |
| `npm run db:seed` | Creates demo users and projects (skips projects if they exist) |
| `npm run db:reset-demo` | Deletes demo projects and their stored files, then seeds again |
| `npm run demo:assets` | Regenerates the sample screenshots and ZIP in `public/demo/` |

## Documentation

| | |
|---|---|
| [01 Product requirements](01-product-requirements.md) | Who it is for, features, roles, non-goals |
| [02 Architecture](02-architecture.md) | Components, request flow, import pipeline, folder layout |
| [03 Database design](03-database-design.md) | Tables, triggers, functions, RLS model |
| [04 WhatsApp processing](04-whatsapp-processing.md) | Supported export formats, parsing, media matching, limits |
| [05 AI integration](05-ai-integration.md) | Providers, prompt, schema, validation, guardrails, cost |
| [06 Frontend development](06-frontend-development.md) | Pages, components, design tokens, charts, accessibility |
| [07 Authentication & security](07-authentication-and-security.md) | Auth flows, authorization layers, threat model |
| [08 Deployment](08-deployment.md) | Supabase setup, GitHub, Vercel, environment variables |
| [09 Automation](09-automation.md) | Scheduled jobs, cron security, logs |
| [10 Testing & test report](10-testing.md) | Test strategy and the latest verified results |
| [11 Development walkthrough](11-development-walkthrough.md) | How to extend the codebase |
| [12 Demo script](12-demo-script.md) | Step-by-step product demo |
| [13 Troubleshooting](13-troubleshooting.md) | Known errors and fixes |
| [DEVELOPMENT_LOG.md](development-log.md) | What was built, decisions, and problems found along the way |

## Known limitations

- **Deployed** at https://issueflow-ai-ai4bi.vercel.app (Vercel, functions in `syd1` next to the Supabase database) and verified with the full browser suite. The cron endpoint is verified over HTTP with the secret; the first *scheduled* run by Vercel Cron happens at the next scheduled time and is visible on the Automations page.
- **xAI Grok has not been called end-to-end** (paid); its request building and response parsing are unit-tested. **GroqCloud has been verified end-to-end** with the sample chat.
- With Groq, screenshots are stored and linked as evidence but not read by the model, and the free plan's per-minute token limit makes large chats slower (processed in batches of 60 messages, waiting when rate-limited).
- The mock provider is a rule-based heuristic tuned on realistic support chats. It is good enough to demonstrate the workflow, not a substitute for a model.
- Screenshots are only *read* by Grok (JPEG/PNG). The mock provider attaches screenshots to issues by timing and context but cannot see their contents.
- Voice notes, video and documents are stored as evidence but not transcribed or analysed.
- Notifications are in-app only (no email/Slack delivery); automation results are recorded in the automation log.
- Supabase's built-in email service is heavily rate-limited; configure custom SMTP before relying on password-reset emails in production.
