# 06 · Frontend development

Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui ("radix-nova" style on the unified `radix-ui` package), Lucide icons, Recharts 3, Sonner toasts, `next-themes`.

## Pages

| Route | Who | What |
|---|---|---|
| `/login`, `/register`, `/forgot-password`, `/reset-password` | public | Auth forms (`components/auth/auth-forms.tsx`) |
| `/setup` | public | Shown instead of crashing when Supabase env vars are missing |
| `/dashboard` | all | KPIs, charts, needs attention, recent imports; project filter |
| `/projects`, `/projects/[id]` | all (create: admin) | Project cards; detail with issues, members, imports, settings |
| `/issues` | all | Table or board (`?view=board`), filters in the URL, pagination (25/page) |
| `/issues/[id]` | all | Detail: editable properties, description, comments, attachments, source messages, activity |
| `/my-tasks` | all | Unresolved issues assigned to me, overdue first |
| `/imports`, `/imports/new`, `/imports/[id]` | managers (members see read-only) | Import list, wizard, import detail with AI processing and draft review |
| `/reports` | all | Five reports with CSV export, scoped by project |
| `/automations` | admin manages; others see status | Jobs, schedules, last runs, run now, enable/disable, logs |
| `/team` | admin manages roles; managers see members | Users and roles |
| `/settings` | all | Profile, theme, AI provider status, security summary; admin: audit log |
| `/search` | all | Full search results (also Ctrl/⌘ K anywhere) |

Data pages are Server Components: they read the user's session, query Supabase under RLS and pass plain data to small client components. Filters live in the URL (`searchParams`), so views are shareable and the back button works.

## Mutations

- **Server Actions** in `lib/actions/*` for all form-style mutations. Every action validates input with Zod (`lib/validation/schemas.ts`), checks the role with `assertViewer`, runs as the user, and returns an `ActionResult` (`{ ok: true, data?, message? } | { ok: false, error, fieldErrors? }`). Database errors are mapped to safe messages (`lib/actions/result.ts`); raw Postgres errors are not shown.
- **Route handlers** for long-running import steps (`/api/imports/[id]/parse|process`) and file downloads (`/api/reports/[report]`).
- Optimistic UI for Kanban moves (`useOptimistic`): the card moves immediately and returns with an error toast if the server rejects the change.

### Forms keep their input

React 19 resets a `<form action={…}>` after each submission. Auth forms keep `action=` (so a submission before hydration is still a POST, never a GET with the password in the URL) and restore non-secret fields through `defaultValue` from the last submission. Dialog forms submit with `onSubmit` instead. Passwords are never kept.

## Components

```
components/
  app-shell/   sidebar (collapsible, state in localStorage), topbar (notifications, theme, user menu), nav, command-search
  shared/      badges (status, priority, category, Simulated, confidence meter), PageHeader/EmptyState/Section,
               user avatar, typed-confirmation dialog, breadcrumbs, project filter
  dashboard/   charts.tsx
  issues/      table, board, filters + pagination, new-issue dialog, properties panel, editor, comments, attachments, delete
  imports/     wizard, process/retry/delete actions, draft review, message list
  projects/ automations/ team/ settings/ auth/
  ui/          shadcn/ui primitives — regenerate with the shadcn CLI, don't hand-edit unless necessary
```

## Design system

- **Tokens** in `app/globals.css` (`:root` and `.dark`): shadcn base tokens with an indigo primary, plus app tokens:
  - `--status-open|progress|blocked|review|resolved|closed`, `--priority-critical|high|medium|low` — used by badges, always paired with an icon and label (never colour alone).
  - `--series-1` (#2a78d6 light / #3987e5 dark) and `--series-2` (#eb6834 / #d95926) for charts, `--chart-grid`, `--chart-axis`.
- **Fonts:** Geist Sans for UI, Geist Mono for issue keys and IDs (`next/font`).
- **Dates:** `lib/format.ts` formats with `Intl` in one display time zone (`NEXT_PUBLIC_APP_TIMEZONE`, default `Asia/Kolkata`) on both server and browser, so server-rendered text matches after hydration (Vercel servers run in UTC). Date-only values (due dates) are never shifted; "today" and overdue use `calendarDate()` in the same zone.
- **Dark mode** via `next-themes` (light / dark / system), toggled in the top bar and Settings.
- **Layout:** single-column grids use `grid-cols-1` (`minmax(0, 1fr)`) so long content (select values, file names, charts) cannot widen the page. Pages are verified to have no horizontal scroll at 390 px and 1440 px.

## Charts

`components/dashboard/charts.tsx`, following these rules:

- Single-series bar charts use one hue (`--series-1`); the two-series "created vs resolved" chart uses `--series-1`/`--series-2` with a legend.
- Created vs resolved is drawn as **running totals** (a burn-up): daily counts of 0–1 are noise, and smoothed curves invented values between days.
- No dual axes. Resolution trend shows resolved count per week; average days to resolve is in the tooltip and the table.
- Every chart has a **table view** toggle (accessible data, exact values) and hover tooltips.
- Grid and axes are recessive; values and labels use text colours, not series colours.

## Accessibility

- Radix primitives provide focus management, keyboard navigation and ARIA for menus, dialogs, selects and tabs.
- Every icon-only button has an `aria-label`; decorative icons are `aria-hidden`.
- Kanban cards can be moved without drag-and-drop through a "Move to" menu.
- Status and priority are always shown as icon + text.
- Form errors are linked with `aria-describedby` and announced with `role="alert"`.
- Disabled wizard sections use `inert`, so they are removed from the tab order.

## Conventions

- Next.js 16 specifics: `proxy.ts` (not `middleware.ts`); `params`/`searchParams` are promises; route types come from `next typegen` (`PageProps<"/issues/[id]">`). Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- `"use server"` files export only async functions; shared types and helpers live in `lib/` (e.g. `lib/search.ts`).
- The React compiler lint rules apply: no impure calls such as `Date.now()` during render, no mutation of values after render.
- Format dates through `lib/format.ts`; domain labels and colours through `lib/domain.ts`.
