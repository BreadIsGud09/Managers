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
  -> TanStack Start server functions (`src/server-functions/*.functions.ts`)
  -> normalized data layer (`src/server/database`)
  -> server-only Supabase client (`src/server/database/supabase-admin.server.ts`)
  -> Supabase Data API
  -> PostgreSQL tables created by `supabase/migrations`
```

Important directories and files:

| Path                                  | Responsibility                                                              |
| ------------------------------------- | --------------------------------------------------------------------------- |
| `src/routes/index.tsx`                | Route metadata and the main page shell                                      |
| `src/components/app/AppTabs.tsx`      | Responsive navigation and lazy feature boundaries                           |
| `src/components/settings`             | Settings-specific UI and data flows                                         |
| `src/components/tabs`                 | Feature screens                                                             |
| `src/components/ui`                   | Reusable Radix/shadcn-style UI primitives                                   |
| `src/server-functions/*.functions.ts` | Browser-callable operations and Zod request validation                      |
| `src/server/database`                 | Privileged Supabase access and normalized relation mapping                  |
| `src/Shared`                          | Shared DTO types, pure calculations, exports, UI helpers, and error helpers |
| `src/integrations/supabase`           | Browser client, auth middleware, and generated DB types                     |
| `src/server.ts`                       | TanStack server entry and SSR error normalization                           |
| `src/start.ts`                        | Global TanStack request/server-function middleware registration             |
| `src/router.tsx`                      | Router and Query Client creation                                            |
| `src/styles.css`                      | Global theme and Tailwind styles                                            |
| `supabase/migrations`                 | Ordered PostgreSQL schema history                                           |
| `vite.config.ts`                      | TanStack/Lovable Vite configuration                                         |

## 4. Database Design

The database uses a normalized relational design in the `public` schema with
numeric identity keys. Current application operations use a server-side secret
client, which bypasses RLS.

| Area                | Tables                                                                   | Meaning                                                            |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| People              | `parents`, `students`                                                    | Parent/contact and reusable student identity                       |
| Courses             | `classes`, `class_levels`, `enrollments`                                 | Class definition, level, and one student's course enrollment       |
| Scheduling          | `class_schedules`, `enrollment_schedules`, `enrollment_schedule_changes` | Reusable weekly slots, assigned slots, and schedule history        |
| Attendance/learning | `attendance_records`, `learning_logs`                                    | Enrollment-specific attendance and class/enrollment learning notes |
| Income              | `income_categories`, `income_transactions`                               | Tuition payments and manual income                                 |
| Expenses            | `expense_categories`, `expense_transactions`                             | Reusable expense categories and expense records                    |
| Staff               | `teachers`                                                               | Teacher identity and contact information                           |
| Notifications       | `notification_settings`                                                  | Singleton Telegram configuration                                   |

The UI's `Student` DTO is a compatibility view of an enrollment, not one raw
`students` table row. `Student.id` carries `enrollment_id`; `Student.person_id`
carries `student_id`. See [architecture.md](./architecture.md) and
[database-layer.md](./database-layer.md) before changing those identifiers.

Important structured fields include `learning_logs.attachments` and the
old/new schedule snapshots on `enrollment_schedule_changes`.

`src/integrations/supabase/types.ts` is the generated TypeScript view of the
database schema. Regenerate it after schema changes.

## 5. Database Configuration

Local credentials belong in `.env.local`. This file is ignored by Git through
the `*.local` rule.

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

- `src/integrations/supabase/client.ts` lazily creates the browser client with
  the publishable key.
- `src/integrations/supabase/auth-attacher.ts` forwards the browser session token
  on server-function calls.
- `src/integrations/supabase/auth-middleware.ts` defines the server token
  validator, but privileged feature functions do not currently register it.
- `src/server/database/supabase-admin.server.ts` lazily creates the privileged
  server client from the secret/service-role key.

The linked Supabase project reference is also stored in
`supabase/config.toml`. It must match the intended remote project before a
migration push.

## 6. Migrations

The normalized base tables already existed in the target project. The active
repository history currently contains two applied migrations:

1. `20260812121658_support_existing_manager_application_features.sql` adds the
   compatibility columns/tables, triggers, access policies, and grants needed by
   the existing UI.
2. `20260812125026_add_normalized_relationship_indexes.sql` adds relationship
   indexes identified by the Supabase performance advisor.

The historical flat-schema migrations are no longer present in the current
`supabase` directory. The old-to-new row transfer was executed separately and
is not a third schema migration.

Migration files are timestamped and must be reviewed and applied in filename
order.

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

| Library                  | Use                                          |
| ------------------------ | -------------------------------------------- |
| `@tanstack/react-start`  | Server functions and full-stack runtime      |
| `@tanstack/react-router` | Routing, metadata, error and not-found pages |
| `@tanstack/react-query`  | Query cache, loading state, mutations        |
| `@supabase/supabase-js`  | Database and authentication clients          |
| `zod`                    | Server-function input validation             |
| `react-hook-form`        | Form state                                   |
| `@hookform/resolvers`    | Form validation integration                  |
| Radix UI packages        | Accessible UI primitives                     |
| `lucide-react`           | Icons                                        |
| `sonner`                 | Toast notifications                          |
| `date-fns`               | Date utilities                               |
| `recharts`               | Charts                                       |
| `xlsx`                   | Spreadsheet import/export                    |
| `html-to-image`          | Exporting rendered UI as images              |

## 8. Commands

```powershell
npm install
npm run dev       # Local app, currently configured for port 8080
npm run build
npm run lint
npm run typecheck
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
3. Telegram bot tokens are sensitive. They are stored in `notification_settings` and
   must only be read through protected server code.
4. Do not edit generated `src/routeTree.gen.ts` manually.
5. Do not duplicate plugins already supplied by
   `@lovable.dev/vite-tanstack-config`; the comments in `vite.config.ts` list them.
6. Schedule and course-end calculations are business-critical. Test changes to
   `src/Shared/shared.ts` against reserve days, multiple daily sessions, and schedule
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

## 11. Maintainability Pattern

Use a feature-oriented, functional React architecture. Do not wrap feature
components in classes or create service classes just to reduce file length.
Hooks, typed functions, and small components compose more naturally with React
and TanStack Query.

The intended dependency direction is:

```text
route shell
  -> app navigation
  -> feature screen
  -> feature hook or event handler
  -> validated server function
  -> typed Supabase client
  -> database
```

Keep each layer focused:

- **Route:** URL, metadata, loader, and page shell. It should not contain a
  feature form or mutation.
- **App navigation:** selects the feature and owns lazy-loading boundaries. It
  should not know feature business rules.
- **Feature screen:** composes cards, tables, dialogs, and feature hooks.
- **Feature component:** owns one interaction, such as editing a payment or
  changing a schedule.
- **Server function:** represents one use case, validates input, performs the
  database operation, and returns a stable typed result.
- **Shared domain module:** contains types and pure business calculations that
  are useful in more than one feature.

When a feature screen grows beyond roughly 300-400 lines, extract by behavior,
not by arbitrary line ranges. Good extraction boundaries are:

1. A dialog with its own form state and mutation.
2. A table/card with a well-defined props interface.
3. A reusable calculation that can become a pure function.
4. A query/mutation group that can become a feature hook.

Keep extracted code near its feature. For example:

```text
src/components/tabs/attendance/
  AttendanceByDate.tsx
  AttendanceByStudent.tsx
  AttendanceBackfillDialog.tsx
```

Avoid a global `services` folder that mixes unrelated domains. The existing
`*.functions.ts` modules are already the server-side use-case boundary.

## 12. Server Function Contract

Every mutation endpoint should follow the same sequence:

1. Define a Zod schema for serialized input.
2. Attach it with `createServerFn(...).validator(...)`.
3. Import the server-only Supabase client inside the handler boundary.
4. Use the generated database types instead of casting the client to `any`.
5. Normalize JSON columns into domain DTOs before returning them to React.
6. Throw a user-safe `Error` when Supabase returns an error.

This makes the server function a typed anti-corruption layer: database storage
types such as `Json` do not leak into UI components. `listStudents`,
`listScheduleChanges`, `listLearningLogs`, and `listFinanceEntries` are current
examples of output normalization.

Query keys are part of a feature contract too. A mutation should invalidate the
same root key used by the corresponding query. Keep a key constant next to the
feature when several operations share it.

## 13. Commenting Guidelines

Comments should explain **why** code exists, especially for business rules,
security boundaries, compatibility behavior, or non-obvious framework behavior.
Do not comment syntax that is already clear from the code.

Useful comment:

```ts
// Legacy database statuses remain readable, but all new writes use the current workflow.
```

Unhelpful comment:

```ts
// Set status to active.
setStatus("active");
```

Use a short JSDoc comment on exported domain helpers or components when their
responsibility is not obvious from the name. Keep detailed operational and
architecture explanations in this guide instead of duplicating them in every
file.

## 14. Current Build Notes

- Feature tabs are loaded with `React.lazy`, so opening one feature does not
  initially download all other feature screens. Radix Tabs still unmounts an
  inactive panel, preserving the prior lifecycle behavior.
- Vite may report that `vite-tsconfig-paths` can be replaced by native
  `resolve.tsconfigPaths`. That plugin is currently injected by
  `@lovable.dev/vite-tanstack-config`, not by this repository's Vite config.
- Nitro may report that `inlineDynamicImports` is ignored when code splitting is
  enabled. This also originates in the build preset. Revisit both messages when
  upgrading the Lovable preset rather than patching generated dependencies.
- The configured chunk warning threshold is 600 kB because the remaining shared
  framework runtime is about 551 kB minified and 162 kB gzip; feature chunks are
  substantially smaller.
