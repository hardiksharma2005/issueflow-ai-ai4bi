# 11 · Development walkthrough

How to work on the codebase: local setup, the shape of a typical change, and recipes for common extensions.

## Local setup

```bash
npm install
cp .env.example .env.local       # fill in Supabase values (docs/08-deployment.md)
npm run db:migrate
npm run db:seed
npm run dev                      # http://localhost:3000, Turbopack
```

Useful while developing:

```bash
npm run test:watch               # unit tests in watch mode
npm run typecheck                # after adding routes: regenerates PageProps/RouteContext types
npm run db:reset-demo            # back to a clean demo dataset
```

Next.js 16 differs from older versions you may know. Before using an unfamiliar API, read the matching guide in `node_modules/next/dist/docs/` (see `AGENTS.md`).

## Anatomy of a feature

A typical change touches these layers, top to bottom:

1. **Database** — new migration `database/migrations/0006_<name>.sql`: table/columns, RLS policies, triggers. Never edit an applied migration; add a new one. Add matching types to `types/db.ts`.
2. **Validation** — a Zod schema in `lib/validation/schemas.ts`.
3. **Server Action** — `lib/actions/<area>.ts`:
   ```ts
   export async function doThing(input: unknown): Promise<ActionResult> {
     try {
       await assertViewer(["admin", "manager"]);           // fast, friendly rejection
       const data = thingSchema.parse(input);              // never trust the client
       const supabase = await createClient();              // runs as the user → RLS applies
       const { error } = await supabase.from("things").insert(data);
       if (error) throw error;
       revalidatePath("/things");
       return ok(undefined, "Thing created");
     } catch (err) {
       return fail(err);                                   // maps errors to safe messages
     }
   }
   ```
4. **Page** — a Server Component under `app/(app)/…` that calls `requireViewer()` and queries Supabase. Read `searchParams` (a promise) for filters.
5. **Client component** — in `components/<area>/`, calling the action with `useTransition` and showing the result with `toast`.
6. **Tests** — unit tests for pure logic; an integration test case if the change adds or relies on a policy; extend `tests/e2e/smoke.mjs` for a new page.

Rules of thumb:

- Authorization belongs in the database. The `assertViewer` check is for a good error message, not for security.
- Use the admin client (`lib/supabase/admin.ts`) only when there is no user (cron) or for auth-admin operations, and only after checking the caller.
- `"use server"` files export only async functions. Put shared types and sync helpers in `lib/`.
- Use `lib/domain.ts` for enum labels and colours and `lib/format.ts` for dates, so the UI stays consistent.

## Recipes

### Add an issue field (e.g. `estimate_hours`)

1. Migration: `alter table public.issues add column estimate_hours numeric(5,1) check (estimate_hours >= 0);`. Decide whether members may change it; if not, nothing else is needed, because `issues_before_update` already blocks members from changing anything except `status` by comparing a fixed list of columns. If they may, adjust that trigger.
2. Add it to `types/db.ts`, `issueUpdateSchema`, the issue properties panel and, if needed, `ISSUE_LIST_SELECT` and reports.

### Add a report

Add an entry to `REPORTS` and a case to `buildReport` in `lib/reports.ts`. The Reports page and the CSV route pick it up automatically; `toCsv` handles escaping.

### Add an automation job

See [09-automation.md](09-automation.md#adding-a-job).

### Add an AI provider

Implement `AIProvider` (`lib/ai/types.ts`): `info` (`name`, `model`, `simulated`, `supportsVision`) and `extract(input) → Promise<string>` returning JSON in the extraction shape. Build the user content with `buildUserPrompt` and keep `SYSTEM_PROMPT` as the system message. Register it in `getAIProvider()` behind its own `AI_PROVIDER` value — don't add fallbacks between providers. Everything downstream (validation, duplicates, drafts) works unchanged. Throw `AIProviderError(message, retryable)` with messages that never include the request or credentials.

### Support another WhatsApp format

Add a fixture line to `tests/unit/parser.test.ts` first, then extend the header regexes or `SYSTEM_PATTERNS` in `lib/whatsapp/parser.ts`. Keep the "never invent" rule: unknown → `null` plus a warning.

### Change the prompt

Edit `lib/ai/prompt.ts` and bump `PROMPT_VERSION` (stored with every draft). Keep the security rules first. Run `npm test` — the AI tests check that the sample chat still produces the expected drafts with the mock and that validation rules hold.

## Debugging

- Server errors are logged with a tag: `[import parse]`, `[import process]`, `[parse route]`, `[import download]`, cron failures in `automation_logs.error`.
- Import state lives in `imports.status`, `error_message` and `parse_warnings` (shown as "Import notes" on the import page). Drafts keep `raw_output` with the provider's untouched answer.
- To see what a user can see, sign in as them. RLS makes the answer the same in the UI and in SQL.
- To inspect the database, use the Supabase Table Editor or SQL editor. Note that the SQL editor runs as `postgres`, which bypasses RLS.
