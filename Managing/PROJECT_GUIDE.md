# Edu Joy Project Guide

## 1. Purpose

Edu Joy is a Vietnamese student-management application for Piano, Dance, and
Drawing classes. It covers students, schedules, attendance, learning logs,
tuition, finance, notifications, and Telegram messages.

## 2. Framework Overview

This is not a Next.js project. It is a full-stack React application built with:

- TanStack Start: SSR, server functions, and application runtime.
- TanStack Router: file-based routing under `src/routes`.
- React 19: UI components and state.
- Vite 8: development server and production build.
- TanStack Query: remote data fetching, caching, and mutations.
- Tailwind CSS 4: styling.
- Supabase: hosted PostgreSQL database and Data API.
- Nitro: production server build, configured through the Lovable Vite preset.

The main screen is `src/routes/index.tsx`. It renders a tabbed application rather
than separate pages. Feature UI is split across `src/components/tabs`.

## 3. Application Structure

```text
Browser UI (`src/components`, `src/routes`)
  -> TanStack Query and `useServerFn`
  -> TanStack Start server functions (`src/lib/*.functions.ts`)
  -> server-only Supabase client (`src/integrations/supabase/client.server.ts`)
  -> Supabase Data API
  -> PostgreSQL tables created by `supabase/migrations`
```

Important directories and files:

| Path | Responsibility |
| --- | --- |
| `src/routes/index.tsx` | Main page, navigation tabs, Telegram settings UI |
| `src/components/tabs` | Feature screens |
| `src/components/ui` | Reusable Radix/shadcn-style UI primitives |
| `src/lib/*.functions.ts` | Server-side queries, validation, and mutations |
| `src/lib/shared.ts` | Shared scheduling and date calculations |
| `src/integrations/supabase` | Browser, server, auth, and generated DB types |
| `src/server.ts` | TanStack server entry and SSR error normalization |
| `src/router.tsx` | Router and Query Client creation |
| `src/styles.css` | Global theme and Tailwind styles |
| `supabase/migrations` | Ordered PostgreSQL schema history |
| `vite.config.ts` | TanStack/Lovable Vite configuration |

## 4. Database Design

The database uses the `public` schema and UUID primary keys for most records.
Row Level Security (RLS) is enabled. Current application operations use the
server-side service-role client, which bypasses RLS.

| Table | Purpose | Main relationships |
| --- | --- | --- |
| `people` | Person profile shared across courses | Parent of `students` |
| `students` | Course enrollment, class, tuition, dates, status, schedule | Optional `person_id -> people.id` |
| `attendance` | Daily attendance, reserve/makeup dates, notes | `student_id -> students.id`, cascade delete |
| `class_schedule` | General weekly schedule by class | Independent reference data |
| `schedule_changes` | History of changes to a student's schedule | `student_id -> students.id`, cascade delete |
| `learning_logs` | Class-wide or student-specific learning notes and attachments | Optional `student_id -> students.id` |
| `tuition_payments` | Payment amount, period, date, and installment number | `student_id -> students.id`, cascade delete |
| `expense_categories` | Reusable finance categories and defaults | Independent reference data |
| `finance_entries` | Monthly income and expenses | Stores optional course/student labels |
| `telegram_settings` | Telegram bot token and group chat ID | Singleton row with `id = 1` |

Important structured fields:

- `students.schedule_slots`: JSON weekly time slots.
- `students.schedule_days`: integer array of weekdays.
- `learning_logs.attachments`: JSON image, video, or link metadata.
- `schedule_changes.old_slots/new_slots`: JSON schedule snapshots.
- PostgreSQL enums constrain class, student status, and attendance status.

`src/integrations/supabase/types.ts` is the generated TypeScript view of the
database schema. Regenerate it after schema changes.

## 5. Database Configuration

Local credentials belong in `.env.local`. This file is ignored by Git through
the `*.local` rule. The cloned `.env` contains the original project's public
configuration; `.env.local` overrides it for local development.

Required variables:

```env
SUPABASE_PROJECT_ID="your-project-ref"
SUPABASE_URL="https://your-project-ref.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="server-secret-or-service-role-key"

VITE_SUPABASE_PROJECT_ID="your-project-ref"
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
```

Rules:

- Only public values may use the `VITE_` prefix because Vite exposes them to the browser.
- Never create `VITE_SUPABASE_SERVICE_ROLE_KEY`.
- Never commit `.env.local` or log the service-role/secret key.
- Restart the dev server after changing environment variables.

Connection code:

- `client.ts` creates the browser client with the publishable key.
- `client.server.ts` creates the privileged server client.
- `auth-middleware.ts` validates a Supabase bearer token for authenticated server calls.
- Current feature server functions call `client.server.ts` directly.

The linked Supabase project reference is also stored in
`supabase/config.toml`. It must match the intended remote project before a
migration push.

## 6. Migrations

Migration files are timestamped and must be applied in filename order. They
create the enums, tables, foreign keys, indexes, RLS configuration, and initial
reference data.

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push
```

After changing the remote schema, regenerate database types:

```powershell
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

Review generated changes before committing them.

## 7. Main Libraries

| Library | Use |
| --- | --- |
| `@tanstack/react-start` | Server functions and full-stack runtime |
| `@tanstack/react-router` | Routing, metadata, error and not-found pages |
| `@tanstack/react-query` | Query cache, loading state, mutations |
| `@supabase/supabase-js` | Database and authentication clients |
| `zod` | Server-function input validation |
| `react-hook-form` | Form state |
| `@hookform/resolvers` | Form validation integration |
| Radix UI packages | Accessible UI primitives |
| `lucide-react` | Icons |
| `sonner` | Toast notifications |
| `date-fns` | Date utilities |
| `recharts` | Charts |
| `xlsx` | Spreadsheet import/export |
| `html-to-image` | Exporting rendered UI as images |

## 8. Commands

```powershell
npm install
npm run dev       # Local app, currently configured for port 8080
npm run build
npm run lint
npm run format
```

On Windows PowerShell systems that block `npm.ps1`, use `npm.cmd`, for example
`npm.cmd run build`.

## 9. Important Notices

1. **Authentication is the main production risk.** Feature server functions use
   the service-role client and do not currently attach `requireSupabaseAuth`.
   Do not expose this application publicly until authentication and authorization
   are enforced on every privileged server function.
2. The service-role key bypasses all RLS policies. Keep it server-only.
3. Telegram bot tokens are sensitive. They are stored in `telegram_settings` and
   must only be read through protected server code.
4. Do not edit generated `src/routeTree.gen.ts` manually.
5. Do not duplicate plugins already supplied by
   `@lovable.dev/vite-tanstack-config`; the comments in `vite.config.ts` list them.
6. Schedule and course-end calculations are business-critical. Test changes to
   `src/lib/shared.ts` against reserve days, multiple daily sessions, and schedule
   changes.
7. Keep Vietnamese source and SQL files encoded as UTF-8.

## 10. Adding a Feature

1. Add schema changes as a new timestamped SQL migration; do not rewrite an
   already-applied migration.
2. Apply the migration and regenerate Supabase TypeScript types.
3. Add validated server operations in the appropriate `*.functions.ts` module.
4. Protect privileged operations with authentication and authorization.
5. Add or update the feature component under `src/components/tabs`.
6. Use TanStack Query keys consistently and invalidate affected queries after mutations.
7. Run lint, build, and a local workflow check before deployment.
