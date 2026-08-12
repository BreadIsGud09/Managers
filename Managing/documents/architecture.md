# Manager application architecture

This document records the current server/database refactor and the ownership of
the resulting folders. The project uses **TanStack Start**, not Next.js.

## What changed during the normalized-database migration

The old application was written around flat tables and kept browser-callable
database functions under the former `src/lib` directory. The current structure separates three
different responsibilities:

1. `src/server-functions` exposes validated operations that React can call.
2. `src/server/database` owns privileged Supabase access and normalized-table
   mapping.
3. `src/Shared` remains for shared types, pure rules, exports, display helpers, and
   error infrastructure. It no longer owns database queries.

The compatibility adapter preserves the existing screens while changing their
storage representation. It does not preserve the old `public.people` query.

The refactor also added a custom `src/server.ts` entry to turn catastrophic SSR
JSON errors into a readable HTML response. `src/start.ts` owns the TanStack
middleware pipeline; it is not the process entry and does not start a port.

## Directory ownership

| This project                         | Closest Next.js mental model     | Responsibility                                                      |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------- |
| `src/routes`                         | App Router route files           | URL, metadata, route shell                                          |
| `src/components`                     | Client/server React components   | UI and user interaction                                             |
| `src/server-functions`               | Server Actions or route handlers | Validate input and expose application operations                    |
| `src/server/database`                | Repository/data-access modules   | Query Supabase and translate normalized relations                   |
| `src/Shared`                         | Shared domain/util modules       | Pure rules, DTO types, conversions, exports, error helpers          |
| `src/integrations/supabase/types.ts` | Generated database types         | Describe current table Row/Insert/Update shapes                     |
| `src/server.ts`                      | Custom server entry              | Delegate requests to TanStack and normalize catastrophic SSR errors |
| `src/start.ts`                       | Global middleware configuration  | Attach auth headers, handle errors, and enforce CSRF filtering      |

There is currently no `src/server/functions` directory. The real endpoint
directory is `src/server-functions`.

## Request flow

```text
Browser component
  -> TanStack Query/useServerFn
  -> createServerFn endpoint in src/server-functions
  -> normalized adapter or admin client in src/server/database
  -> Supabase PostgREST/Data API
  -> PostgreSQL tables
```

`server.ts` and `start.ts` surround this feature flow:

```text
HTTP request
  -> src/server.ts
      -> TanStack generated fetch handler
          -> middleware configured by src/start.ts
              -> route rendering or createServerFn handler
  -> src/server.ts checks catastrophic 500 responses
  -> HTTP response
```

## `server.ts` versus `start.ts`

### `src/server.ts`: outer entry

The runtime imports the default plain object and calls its `fetch()` method. It:

- lazy-loads and caches TanStack Start's generated server handler;
- forwards each request to that handler;
- catches errors that escape the handler;
- recognizes the generic JSON 500 produced when h3 swallows an SSR exception;
- logs the captured original error and returns `renderErrorPage()`.

It does not define feature endpoints, authenticate a manager, or access
Supabase.

### `src/start.ts`: middleware pipeline

`createStart()` registers two middleware groups:

- `functionMiddleware`: `attachSupabaseAuth` adds the current browser session's
  bearer token to TanStack server-function requests when one exists.
- `requestMiddleware`: `errorMiddleware` normalizes unexpected errors and
  `csrfMiddleware` rejects cross-site requests targeting privileged server
  functions.

This file does not create a Node HTTP server or listen on a port. Vite/Nitro and
TanStack own that runtime behavior.

## Application objects and normalized rows

The project uses TypeScript interfaces and plain DTO objects, not ORM entity
classes. The most important DTO is `Student` from `src/Shared/shared.ts`.

In the UI, `Student` means one course enrollment. In the normalized database it
is assembled from multiple rows:

```text
parents
  -> students (person identity)
      -> enrollments (the UI Student/course)
          -> classes + class_levels
          -> enrollment_schedules -> class_schedules
          -> attendance_records
          -> income_transactions (tuition payments)
```

Therefore:

| DTO field                   | Actual database key                 |
| --------------------------- | ----------------------------------- |
| `Student.id`                | `enrollments.enrollment_id`         |
| `Student.person_id`         | `students.student_id`               |
| `AttendanceRow.student_id`  | `attendance_records.enrollment_id`  |
| `TuitionPayment.student_id` | `income_transactions.enrollment_id` |

Those legacy DTO field names remain because changing every screen at the same
time would be a separate UI-domain migration.

## Why no classes or ORM entities

This project uses `@supabase/supabase-js`, which is a typed query client rather
than an ORM. It does not generate active-record classes. The runtime objects
are:

- a lazily created Supabase client object;
- Zod schema objects used to validate untrusted input;
- ordinary DTOs returned to the UI;
- temporary `Map` objects used to join normalized rows in memory.

TypeScript interfaces provide compile-time descriptions and disappear from the
built JavaScript. Stateless functions are sufficient because TanStack owns the
request lifecycle and no domain object currently needs private mutable state.

## Detailed module documentation

- [`database-layer.md`](./database-layer.md) explains
  `manager-data.server.ts`, its read/write sequence, and its limitations.
- [`server-functions.md`](./server-functions.md) lists the remote application
  API and validation boundary.
- [`shared-library.md`](./shared-library.md) explains why `src/Shared` exists and
  what may live there.

## Database access and security

`src/server/database/supabase-admin.server.ts` creates a privileged client from
server environment variables. Its secret/service-role key bypasses RLS and
must never enter a browser bundle.

The current middleware attaches a browser token but privileged handlers do not
yet enforce `requireSupabaseAuth` or a manager role. CSRF protection is useful,
but it is not user authorization. Before public deployment, validate the user
and manager permission on the server for every privileged endpoint. A route
`beforeLoad` check is only an additional navigation/UX guard.

## Current migration record

The target Supabase project already had the normalized base tables. Two active
schema migrations were then applied:

| Migration                                                          | Purpose                                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `20260812121658_support_existing_manager_application_features.sql` | Compatibility columns, supporting tables, triggers, access policies, and grants needed by the existing features |
| `20260812125026_add_normalized_relationship_indexes.sql`           | Indexes for normalized relationship foreign keys                                                                |

The old flat-schema migration files are no longer present in the current
`supabase` directory. Only the two normalized migration files remain. The
old-to-new row transfer was executed separately from these migration files.

## Known limitations requiring a future decision

- Privileged server functions need server-side user and role authorization.
- `saveEnrollmentStudent` uses several Data API requests instead of one
  transaction, so a partial failure can leave intermediate data.
- A placeholder parent is created when the old UI supplies no parent details.
- The flat UI name `Student` really means `Enrollment`; renaming it would improve
  clarity but would touch most feature screens and should be done separately.
- The first local migration file includes normalized base-table setup for clean
  rebuilds, while the exact initially applied remote SQL was narrower. Reconcile
  that local/remote migration-content drift before treating the repository as a
  reproducible empty-database build.
