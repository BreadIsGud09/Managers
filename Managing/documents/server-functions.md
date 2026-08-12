# TanStack server functions

The actual directory name is `src/server-functions`, not
`src/server/functions`.

These files are the application's browser-to-server API. A TanStack Start
`createServerFn` is similar to a Next.js Server Action or an MCP tool handler:
the browser calls a named operation, TanStack transports the serialized input
to the server, the server validates it, runs privileged work, and returns a
serializable result.

```text
React component
  -> createServerFn endpoint in this directory
  -> server-only adapter/client in src/server/database
  -> Supabase Data API
  -> PostgreSQL
```

## Responsibilities

Every server function should:

1. Represent one application use case such as `upsertStudent`.
2. Validate untrusted input with Zod before accessing the database.
3. Load privileged database modules only inside the server handler.
4. Convert database errors into ordinary application errors.
5. Return a stable serializable object for React and TanStack Query.

It should not render UI, hold React state, or expose the service-role key.

## Files and exported operations

| File                        | Exported operations                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enrollment.functions.ts`   | `listStudents`, `upsertStudent`, `deleteStudent`; schedule listing; attendance list/set/delete; people grouping; schedule-change and reserve-date operations |
| `tuition.functions.ts`      | `listPayments`, `upsertPayment`, `deletePayment`, stored as tuition-origin `income_transactions`                                                             |
| `finance.functions.ts`      | `listExpenseCategories`, `listFinanceEntries`, `upsertFinanceEntry`, `deleteFinanceEntry` for manual income and expenses                                     |
| `learning.functions.ts`     | `listLearningLogs`, `upsertLearningLog`, `deleteLearningLog` for class-wide or enrollment-specific notes                                                     |
| `notification.functions.ts` | `getTelegramStatus`, `saveTelegramConfig`, plus schedule, expiry, attendance, and custom Telegram send operations                                            |

The `*.functions.ts` suffix means "remote operations," not general utility
functions. Reusable pure calculations belong in `src/Shared`.

## Inputs and returned objects

- Zod schema objects such as `StudentInputSchema` exist at runtime and reject
  malformed browser input.
- TypeScript interfaces such as `Student` only describe shapes during
  development; they do not create runtime objects or database models.
- Returned DTOs intentionally use UI names and string IDs. The database adapter
  handles normalized table names and numeric IDs.

No classes are required because each export is a stateless endpoint. TanStack
Start owns request lifecycle and transport; Supabase owns the database client.

## Authentication and authorization notice

`src/start.ts` currently registers `attachSupabaseAuth`, which attaches an
existing browser access token to a server-function request. The privileged
functions in this directory do **not** currently register
`requireSupabaseAuth`, and they do not perform a manager-role check before using
the service-role database client.

Therefore this boundary is not ready to be exposed publicly. A route
`beforeLoad` check may improve navigation behavior, but it cannot protect these
endpoints: a caller can invoke an endpoint without loading the route. Enforce
authentication and manager authorization on the server before every privileged
operation.

## Adding an operation

1. Put it in the feature's existing `*.functions.ts` file.
2. Define a strict Zod input schema.
3. Use `.validator(...)` before `.handler(...)` for mutations.
4. Call a focused function from `src/server/database` when normalized mapping is
   shared or complex.
5. Return a DTO rather than a raw Supabase response.
6. Invalidate the matching TanStack Query key in the calling component.
