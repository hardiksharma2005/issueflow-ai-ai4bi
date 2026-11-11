# 07 · Authentication & security

## Authentication

Supabase Auth with email + password, used through `@supabase/ssr` cookie sessions.

| Flow | Implementation |
|---|---|
| Register | `signUp` action. Password ≥ 8 characters (Zod, plus Supabase's own policy). With email confirmation on, the user gets a link to `/auth/callback`; with it off, they are signed in directly. New users are members; the very first user becomes admin (database trigger). |
| Sign in | `signIn` action. Unknown email and wrong password return the same message ("Invalid email or password.") so accounts cannot be enumerated. Records `auth.login` in the audit log. |
| Sign out | `signOut` action; records `auth.logout`. |
| Forgot password | `requestPasswordReset` always answers "If an account exists for that email, a reset link is on its way." The link goes through `/auth/callback` to `/reset-password`. |
| Reset password | `updatePassword` (requires the recovery session from the link); records `auth.password_reset`. |
| Invite (admin) | `inviteUser` uses the service role to send a Supabase invite; the invitee sets a password via `/reset-password`. |

`/auth/callback` supports both the PKCE `?code=` and the `?token_hash=&type=` link formats. Post-login redirects (`?next=`) pass through `safeRedirectPath` (`lib/redirect.ts`), which accepts a path only if it resolves to the same origin (rejects `//host`, `/\host`, tab/newline tricks, absolute URLs).

Sessions: `proxy.ts` validates the JWT with `getClaims()` on every page request and refreshes the cookie. Server code never trusts `getSession()` for authorization.

## Authorization — three layers

1. **UI** hides actions the user can't take (convenience only).
2. **Server Actions / routes** call `assertViewer(roles)` and validate all input with Zod; import routes re-check the role; cron requires the bearer secret.
3. **Database** — the actual control. Every query from a user runs with their JWT, so RLS policies, guarded triggers and `SECURITY INVOKER` RPCs apply no matter which code path is used, including direct calls with the public anon key. See the policy matrix in [03-database-design.md](03-database-design.md).

Role changes are protected twice: only admins may change roles (`protect_profile_update` trigger), and the role is never taken from user-editable sign-up metadata. The last admin cannot be demoted or removed.

Verified by `tests/integration/rls.test.ts` against a real project: anonymous access, cross-project reads, self-promotion to admin, members creating issues/projects, members editing fields other than status, managers acting outside their projects, assigning non-members, reading audit logs, calling non-whitelisted audit events, members approving drafts, double approval, duplicate imports, search scoping, storage paths.

## Secrets

| Secret | Where it lives | Exposure |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server env only; read in `lib/supabase/admin.ts` (`server-only`) | Never `NEXT_PUBLIC_`; used for cron, invites, seed |
| `XAI_API_KEY` | Server env only; `lib/ai/grok.ts` (`server-only`) | Never logged or echoed in errors |
| `CRON_SECRET` | Server env + Vercel Cron | Compared with `timingSafeEqual`; if unset, cron returns 503 instead of running unauthenticated |
| `SUPABASE_DB_URL` | Local `.env.local` only | Used by `db:migrate`; not needed at runtime or on Vercel |
| `DEMO_PASSWORD` | Local `.env.local` only | Seed only |

`.env*` files are git-ignored (except `.env.example`, which contains no values). The Supabase anon/publishable key is designed to be public; RLS is what protects the data.

## Input handling

- **All mutations** are validated with Zod schemas (`lib/validation/schemas.ts`); issue updates use a `.strict()` schema so unexpected fields are rejected.
- **Uploads:** extension allow-list, size caps, server-side magic-byte check, ZIP entry/size caps, file names sanitised, archive paths flattened; storage bucket enforces its own size and MIME limits. See [04-whatsapp-processing.md](04-whatsapp-processing.md).
- **Search:** user input is escaped for `LIKE` and passed as a parameter; PostgREST filters are built from sanitised values.
- **Output:** all user and WhatsApp content is rendered as text by React; there is no `dangerouslySetInnerHTML`.
- **CSV export:** cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'` to prevent formula injection in spreadsheet apps.
- **Errors:** database and provider errors are mapped to generic messages; stack traces and SQL are not sent to the browser.

## AI-specific risks

Covered in [05-ai-integration.md](05-ai-integration.md#guardrails-summary): prompt injection, invented facts, unauthorized actions, cost and data exposure.

## HTTP security headers

Set in `next.config.ts` for every route: `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Vercel serves HTTPS with HSTS by default.

A full script Content-Security-Policy is not set: it needs per-request nonces for Next.js inline scripts, which forces every page into dynamic rendering. Worth adding when the app is deployed publicly.

## Logging and audit

- `audit_logs` records sensitive actions (see [03](03-database-design.md#triggers-and-functions)) with actor, entity and changed field names. Long or sensitive text is recorded as "changed", never copied. Passwords and keys never reach the database through the app.
- Server logs contain error messages only, never request bodies, tokens or keys.
- Admins can browse the audit log in **Settings**.

## Abuse limits

- AI processing: 15 runs per user per hour (database-backed, works across serverless instances).
- Supabase Auth applies its own rate limits to sign-in, sign-up and email sending.
- Request bodies: Server Actions limited to 4 MB; large files go directly to storage.

## Known gaps

- No MFA (Supabase supports TOTP; not wired into the UI).
- No CAPTCHA on sign-up; enable Supabase's hCaptcha/Turnstile integration for public deployments.
- No script CSP (see above).
- Open sign-up: anyone can register as a member, but a member with no project membership can see nothing except their own profile. Disable sign-ups in Supabase (Authentication → Sign In / Providers) to make the workspace invite-only.
