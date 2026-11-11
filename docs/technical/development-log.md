# Development log

A record of how IssueFlow AI was built: the order of work, the decisions taken and why, and the problems found along the way. Newest entries last. Dates are 2026.

## 1. Environment and scaffolding

- Checked the toolchain: Node.js 26, npm, git; no Vercel CLI; Supabase and xAI accounts not yet connected.
- `create-next-app` → Next.js 16.4.6, React 19.3, TypeScript, Tailwind CSS 4, ESLint. Read the bundled Next.js 16 docs before writing code: `proxy.ts` replaces `middleware.ts`, `params`/`searchParams` are promises, typed routes come from `next typegen`.
- shadcn/ui CLI v4 ("radix-nova" style, unified `radix-ui` package). The generated code imports `cn` from an npm package called `cn`; verified the publisher (shadcn) before keeping it, since a two-letter package name is a typosquatting risk.
- Dependencies: `@supabase/ssr`, `@supabase/supabase-js`, `zod` 4, `recharts` 3, `jszip`, `sonner`, `next-themes`, `date-fns`, `postgres` (migrations), Vitest, `tsx`, `sharp` (demo images).
- `cacheComponents` disabled: nearly every page depends on the session cookie, and per-request rendering keeps permission changes immediate.

## 2. Database first

Authorization was designed in Postgres before any UI, so that no page or action could become the only line of defence.

- `0001_schema.sql`: 14 tables. AI output (`issue_drafts`) is kept separate from approved `issues`; original messages (`source_messages`) are never edited; duplicate imports are prevented by a partial unique index on `(project_id, content_hash)`.
- `0002`: `SECURITY DEFINER` helper functions with an empty `search_path` (no RLS recursion, no search-path hijacking); first user becomes admin; roles never read from sign-up metadata; a trigger restricts members to status changes; activity and audit triggers; review operations as `SECURITY INVOKER` RPCs so approval is atomic **and** subject to RLS.
- `0003`: RLS on every table, nothing executable by `anon`.
- `0004`: private storage bucket, policies keyed on the project id at the start of the object path.
- Audit trigger redacts long/sensitive text fields; the client-callable audit function accepts only a whitelist of event names.

## 3. WhatsApp parser and media matching

- Wrote the parser test-first against Android (12/24 h), iOS, dotted and ISO formats, including the invisible U+200E marks and narrow no-break spaces WhatsApp inserts.
- Date order detected across the whole file; ambiguity becomes a warning, never a silent guess. Unknown sender/date → `null`.
- Media matched by exact name, then normalised name, then iOS timestamp (± 2 min). Unmatched files are kept as loose evidence, never attached by guesswork.

## 4. AI layer

- `AIProvider` interface with two implementations. Grok uses the xAI **Responses API** with a strict JSON schema (checked against current xAI docs: endpoint, `text.format`, image input as data URLs, JPEG/PNG only).
- Validation treats the model as untrusted: unknown refs dropped, issues without evidence dropped, reporter and date taken from source messages, assignee kept only if literally mentioned, duplicate keys checked against real issues. One retry on malformed output.
- Prompt: security rules first, conversation as JSON inside a delimited block, opaque refs (`m12`, `a3`) instead of database ids.
- **MockAIProvider**: deterministic clustering so the full workflow runs free. First version produced 9 issues for the 7 in the sample chat. Iterated with tests: same-sender continuation, short agreement/action-request follow-ups, topic containment with a stop-word list, explicit "any update on…" follow-ups. Fixed a regex that turned "sorry" into "rry" (missing word boundary). The test for the prompt-injection message was initially a false positive (matched the legitimate "admin panel" issue); rewritten to assert the message is never cited as evidence.
- Decision: **no fallback** between providers in either direction, and mock output is always labelled Simulated, so nobody can mistake a heuristic for a model or be billed unexpectedly.

## 5. Application

- Auth pages, `proxy.ts` session refresh with `getClaims()`, `requireViewer`/`assertViewer`.
- Projects, issues (table with URL filters and pagination, Kanban with optimistic moves and a keyboard alternative, detail page), My Tasks, comments, attachments via direct-to-storage upload.
- Import wizard → parse route → process route → draft review (approve, reject, link to existing issue, merge drafts).
- Dashboard (charts with table views, following a validated two-colour series palette), global search (`search_all` RPC under RLS), reports with formula-safe CSV, automations with a constant-time cron secret check, team management, settings with the admin audit log.
- Demo dataset: sample chat with 7 issues, a prompt-injection attempt and missing media; generated screenshots and ZIP; seed with 5 users, 3 projects, 24 backdated issues, a past import and real automation runs.
- Build issues fixed: a sync helper exported from a `"use server"` module; `/` and `/setup` prerendered statically; `Date.now()` during render flagged by the React compiler lint.

## 6. Connecting a real Supabase project

The first run against a real project found problems that mocks couldn't:

- `db:migrate` failed: `tsx` compiled the script as CommonJS, where top-level `await` isn't allowed → wrapped in `main()`.
- The database password still had the placeholder's `[ ]` → documented in setup and troubleshooting.
- The Supabase URL had been pasted with `/rest/v1/` → URLs are now normalised to their origin.
- Seed writes without `.select()` return no rows, which the helper treated as failure → separate error-only check for writes; previously unchecked writes now checked.
- Migrations, seed and the 12 RLS integration tests then passed against the real database.

## 7. Browser testing and fixes

Drove the production build in headless Edge for every role (scripts later consolidated into `tests/e2e/smoke.mjs`).

- **Layout overflow:** the draft review column spilled out of its card when a long duplicate title was selected, and three pages scrolled sideways at phone width. Root cause: single-column CSS grids use an implicit `auto` track that grows to the widest child. Fixed across the app with `grid-cols-1` (`minmax(0,1fr)`).
- **Chart honesty:** smoothed daily counts of 0–1 drew humps between days that never happened → running totals with straight lines.
- **Import title** showed a screenshot name → chat export listed first.
- **Storage leak:** deleting a project removed attachment files but not raw uploads → files collected before the delete; `db:reset-demo` also removes orphaned folders.
- **Forms cleared on error:** React 19 resets `<form action>` after submission → auth forms restore non-secret fields via `defaultValue` (keeping a POST fallback before hydration so passwords never land in a URL); dialogs submit via `onSubmit`.

## 8. Documentation and security review

Writing the security documentation meant re-reading each control:

- **Open redirect:** the email-link callback accepted `next=/\evil.com`, which `new URL()` resolves to another host. Sign-in and callback now share `safeRedirectPath`, which checks the resolved origin (also covers tab/newline tricks), with unit tests.
- Added HTTP security headers (no framing, `nosniff`, referrer and permissions policies). A script CSP is documented as future work (needs nonces).
- Every documentation claim was checked against the code; several were corrected (manager's project list, report names, which columns are immutable, where notifications come from).

## 9. Resilience

Running the browser suite repeatedly against a project in another region surfaced intermittent `ECONNRESET`s:

- A retried import that had failed after storing messages hit the unique `(import_id, seq)` constraint and reported "already imported" — it could never succeed. Retries now remove the previous attempt's rows first. Verified by retrying a real half-failed import.
- A dropped connection during the session check was treated as "signed out" (redirect to login / "You are not signed in"). It now produces a retryable 503 / error page; the proxy lets the request through instead of redirecting.
- Server-side Supabase clients retry **reads** once on a dropped connection; writes are never retried automatically.

Final state: lint and typecheck clean, 56 unit tests, 12 integration tests, 36 end-to-end checks passing. See [docs/10-testing.md](10-testing.md).

## Open items

- Deploy to Vercel and verify Vercel Cron in production.
- Run a real Grok extraction with a key and compare with the mock on the sample chat.
- Test with real exports from more locales.
- MFA, CAPTCHA on sign-up, script CSP, email/Slack delivery of automation results.
