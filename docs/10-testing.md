# 10 · Testing and test report

## Test suites

| Suite | Command | Needs | What it covers |
|---|---|---|---|
| Unit | `npm test` | nothing | WhatsApp parser, media matching, AI output validation, mock extraction on the sample chat, duplicate scoring, Grok response parsing, file validation, input schemas, analytics, reports/CSV, cron parsing, redirect safety |
| Integration | `npm run test:integration` | Supabase project with migrations applied (`.env.local`) | Row Level Security and database guardrails, run as real users with the public key. Creates its own users and projects and deletes them afterwards. Skipped automatically if Supabase is not configured. |
| End-to-end | `npm run test:e2e` | running app (`npm start` or `npm run dev`), seeded demo data, Edge or Chrome installed | Real browser (playwright-core): every page for every role at 1440 px and 390 px, member permissions, the full WhatsApp import with AI review, duplicate import, CSV export, search, registration, sign-out, password reset, automations. Changes demo data — run `npm run db:reset-demo` afterwards. |
| Static | `npm run lint`, `npm run typecheck` | nothing | ESLint (Next.js + React compiler rules), route types + `tsc --noEmit` |

Set `E2E_BROWSER=chrome` to use Chrome instead of Edge, and `E2E_BASE_URL` to test another deployment.

## Test report — 10 November 2026

Environment: Windows 11, Node.js 26.8, Next.js 16.4.6 production build (`next build` + `next start`), Supabase free-tier project (region ap-southeast-2), `AI_PROVIDER=mock`, Microsoft Edge (headless) for the browser suite.

| Check | Result |
|---|---|
| `npm run lint` | pass, 0 problems |
| `npm run typecheck` | pass |
| `npm run build` | pass, 26 routes |
| `npm test` | **56 / 56 passed** (3 files) |
| `npm run test:integration` | **12 / 12 passed** against the real database |
| `npm run test:e2e` | **36 / 36 checks passed** |
| `npm run db:migrate` on an empty project | 5 migrations applied |
| `npm run db:seed` / `db:reset-demo` | 5 users, 3 projects, 24 issues, 1 past import, 4 automation runs |

### Integration tests (database, as real users)

| # | Scenario | Result |
|---|---|---|
| 1 | Anonymous client reads no issues; cannot call `search_all` | pass |
| 2 | Members see only their projects; outsiders see no issues of other projects | pass |
| 3 | Member cannot promote themselves to admin ("Only admins can change roles") | pass |
| 4 | Member cannot create issues or projects | pass |
| 5 | Member can change status of an assigned issue only, and no other field | pass |
| 6 | Manager can create/assign in own project; not in other projects; cannot assign non-members | pass |
| 7 | Activity history recorded; audit log written; members cannot read the audit log | pass |
| 8 | Non-whitelisted audit events are rejected | pass |
| 9 | Member cannot approve or even see drafts; manager approval is single-use; import completes | pass |
| 10 | Same conversation cannot be imported twice into a project (unique violation) | pass |
| 11 | Search returns only rows the caller may see | pass |
| 12 | Storage: cannot upload into another project's folder; outsiders cannot download | pass |

### End-to-end checks (browser)

| Area | Checks | Result |
|---|---|---|
| Signed-out | redirect to login; cron 401 without secret; CSV export 401 | 3 pass |
| Every page × admin/manager/member × desktop/phone | HTTP 200, no error boundary, no page errors, **no horizontal scroll at 390 px** | 6 pass |
| Member | cannot start imports; status editable, priority/assignee locked; status saved; comment saved; import APIs return 403; no audit log | 7 pass |
| Manager import | 37 messages parsed; 7 drafts; "Simulated" labels; duplicate of BLOOM-7 flagged; prompt injection not turned into an issue; evidence images load; approve/reject; approved issue has source `whatsapp_import` and 9 linked messages; re-import blocked; CSV export; Ctrl+K search; no page errors | 13 pass |
| Accounts | weak password rejected with input kept; registration creates a member with no projects; sign-out; generic wrong-password message; forgot-password does not reveal accounts; admin "Run now" | 7 pass |

### Manual and HTTP checks

| Check | Result |
|---|---|
| Cron endpoint: no header → 401, wrong secret → 401, unknown job → 404, valid secret → 200 with logged run | pass |
| Cron with `CRON_SECRET` unset → 503 (does not run unauthenticated) | pass (before Supabase was configured) |
| App without Supabase env vars → `/setup` page instead of a crash | pass |
| Security headers present on responses | pass |
| Retry after a parse that failed half-way (37 messages already stored) → parsed cleanly | pass |
| Visual review of dashboard, board, import review (desktop and phone) | pass after fixes below |

### Defects found during testing (all fixed)

| Defect | Found by | Fix |
|---|---|---|
| `db:migrate` crashed (top-level await compiled to CommonJS) | first run | wrapped in `main()` |
| Seed failed: writes without `.select()` return no rows | first run | error-only `check()` for writes |
| Pasted `…/rest/v1/` Supabase URL broke admin API calls | first run | URL normalised to origin |
| Draft review column overflowed its card when a long duplicate title was selected; three pages scrolled sideways on phones | browser | `grid-cols-1` (`minmax(0,1fr)`) for single-column grids; truncating selects |
| Created-vs-resolved chart drew invented humps between days | visual review | running totals with straight lines |
| Import titled after a screenshot instead of the chat | visual review | chat files listed first |
| Deleting a project left raw import uploads in storage | storage audit | collect and remove raw files; reset cleans orphans |
| Forms lost all input after a validation error | browser | keep values (auth: `defaultValue`; dialogs: `onSubmit`) |
| Open redirect: auth callback accepted `next=/\evil.com` | security review while documenting | shared `safeRedirectPath` checks the resolved origin; unit tests |
| Retrying a half-failed import hit a unique-constraint error and could never succeed | browser (network drop) | retry clears the previous attempt's rows |
| A dropped connection during the session check showed "not signed in" / redirected to login | browser (network drop) | 503 / retryable error instead; reads retried once |

### Not verified

- **xAI Grok end-to-end.** No API key was used (paid). Request building and response parsing are unit-tested; a real call has not been made.
- **Vercel deployment and Vercel Cron.** Not deployed yet; cron was exercised locally over HTTP with the bearer secret.
- **Email delivery** (confirmation, reset, invite). Email confirmation was off for testing; the forgot-password check used an address with no account so no email was sent.
- **Real WhatsApp exports from many locales.** The parser is tested with Android/iOS, 12/24 h, dotted and ISO formats and localised attachment markers, using synthetic fixtures.
- Browsers other than Chromium-based Edge; screen-reader testing.

## Writing tests

- Unit tests live in `tests/unit/*.test.ts`; `@/` resolves to the project root and `server-only` is stubbed.
- Integration tests must clean up everything they create (`afterAll`). Use `describe.skipIf(!enabled)` so the suite stays green without credentials.
- For UI changes, run `npm run test:e2e` against a production build — it catches layout overflow, error boundaries and permission regressions that unit tests can't.
