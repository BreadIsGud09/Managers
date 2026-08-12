# Supabase admin client lifecycle

This document explains what
`src/server/database/supabase-admin.server.ts` creates, what its lifetime is,
and how that differs from query objects and application DTOs.

## Short answer

`supabase-admin.server.ts` lazily creates and reuses one privileged
`SupabaseClient<Database>` object for each loaded server module instance.

It does **not** create or manage:

- database DTO lifetimes;
- ORM entity objects;
- a persistent PostgreSQL connection;
- a transaction or unit of work;
- one database client per signed-in user.

The word `Database` in `SupabaseClient<Database>` is a TypeScript generic. It
provides compile-time table, column, row, insert, and update types from
`src/integrations/supabase/types.ts`. It does not construct database rows or
keep returned DTOs alive at runtime.

## The three different object lifecycles

| Object              | Created by                                                    | Typical lifetime                                                                         | Purpose                                                                                     |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Supabase client     | `createAdminClient()`                                         | Reused for the lifetime of one server process, worker isolate, or loaded module instance | Stores the project URL, secret key behavior, auth options, and HTTP transport configuration |
| Query builder       | A call such as `db.from("students").select("*")`              | One operation, normally until its promise resolves                                       | Describes and sends one PostgREST/Data API request                                          |
| DTO or returned row | Supabase response mapping, such as `listEnrollmentStudents()` | One request/response unless another part of the app caches it                            | Carries serializable application data to server functions and React                         |

These objects are related, but `supabase-admin.server.ts` directly controls only
the first one.

## How the client lifecycle works

The lifecycle is implemented by these three pieces:

```ts
function createAdminClient() {
  return createClient<Database>(url, secretKey, options);
}

let adminClient: ReturnType<typeof createAdminClient> | undefined;

export function getAdminDatabase() {
  adminClient ??= createAdminClient();
  return adminClient;
}
```

### 1. Module loading

When the server loads this module, `adminClient` starts as `undefined`. No
Supabase client is created merely by importing the file.

### 2. First database operation

A server function eventually calls `getAdminDatabase()`. The `??=` expression
sees that `adminClient` is undefined and calls `createAdminClient()` once.

`createAdminClient()`:

1. Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the server
   environment.
2. Throws immediately if either value is missing.
3. Creates a typed Supabase client.
4. Installs the custom API-key-aware `fetch` implementation.
5. Disables browser-style session storage, session persistence, and automatic
   token refresh.

### 3. Later operations

Later calls to `getAdminDatabase()` return the same client reference. They do
not repeatedly read credentials or create a new client for every query.

```text
Request A -> getAdminDatabase() -> create client -> client A
Request B -> getAdminDatabase() -----------------> client A
Request C -> getAdminDatabase() -----------------> client A
```

This is a **lazy module-level singleton**, not a guaranteed single object for
the entire deployment. A platform can run multiple Node processes, serverless
instances, or Cloudflare Worker isolates. Each loaded instance receives its own
module variable and therefore its own Supabase client.

Development hot reloads and production restarts can also reload the module and
create a replacement client.

### 4. Runtime shutdown

There is no explicit `close()` call because `@supabase/supabase-js` communicates
with the Supabase Data API using HTTP `fetch`. It is not holding a direct
`pg.Client` connection that this module must release. The JavaScript client and
its module variable become collectible when the process or isolate is stopped.

Supabase/PostgREST and the deployment runtime manage the underlying network and
database connection pooling outside this file.

## Query-object lifecycle

Calling `getAdminDatabase()` returns the reusable client. Calling `.from()` on
that client creates a new query builder:

```ts
const db = getAdminDatabase();

const query = db
  .from("students")
  .select("student_id,first_name,last_name")
  .eq("student_id", studentId);

const { data, error } = await query;
```

The `query` object is specific to this operation. It accumulates table,
selection, filter, ordering, and mutation information and sends an HTTP request
when awaited. It is not stored by `supabase-admin.server.ts` and should not be
reused as global mutable state.

Separate requests share the configured Supabase client but create separate
query builders and responses.

## DTO lifecycle

A DTO is an ordinary serializable object shaped for the application. For
example, `manager-data.server.ts` converts normalized rows from `students`,
`enrollments`, `classes`, and schedule tables into the UI's `Student` DTO.

```text
Supabase client
  -> one query builder per query
  -> raw table rows returned by Supabase
  -> manager-data mapping
  -> Student DTO
  -> server-function response
  -> React/TanStack Query cache
```

The admin-client module does not store those rows or DTOs. Their lifetime is
controlled by the local function variables, the server response, JavaScript
garbage collection, and—after reaching the browser—TanStack Query's cache.

## Why reuse one client

Reusing the client:

- centralizes the secret key and transport behavior;
- avoids repeating client configuration on every operation;
- provides one consistent generated `Database` type contract;
- is safe for concurrent HTTP queries because query builders are created per
  operation;
- makes accidental browser imports easier to identify through the `.server.ts`
  location and suffix.

The shared client must not be changed into a user-session client. Calling
methods that mutate its auth session per request could mix request identity on a
shared runtime. User authentication should be validated separately, and this
client should remain a fixed server-administration client.

## Secret-key request behavior

`createApiKeyFetch()` wraps `fetch` for the newer opaque `sb_secret_...` key
format:

1. It preserves request and caller-supplied headers.
2. It removes `Authorization: Bearer <secret>` when the opaque secret was placed
   there as though it were a JWT.
3. It always sets the `apikey` header.
4. It sends the request with the platform's normal `fetch` implementation.

This transport adjustment does not perform manager authorization. The secret
key is privileged and bypasses Row Level Security, so the caller must already
have passed server-side authentication and authorization before accessing this
client.

## Transactions and connection-scoped behavior

Reusing this client does not make several Data API calls atomic. For example,
multiple inserts and updates inside `saveEnrollmentStudent()` remain separate
HTTP/database operations even though they use the same client object.

When several statements must either all succeed or all fail, implement that
unit as a transactional PostgreSQL function and call it with Supabase RPC, or
use an explicitly managed direct PostgreSQL transaction in server-only code.

## Source and related documents

- Implementation: `src/server/database/supabase-admin.server.ts`
- Normalized mapping: `src/server/database/manager-data.server.ts`
- Database layer: [`database-layer.md`](./database-layer.md)
- Server API boundary: [`server-functions.md`](./server-functions.md)
- Supabase reference: [Initializing the JavaScript client](https://supabase.com/docs/reference/javascript/initializing)
- Supabase reference: [Using a secret key on the server](https://supabase.com/docs/guides/troubleshooting/performing-administration-tasks-on-the-server-side-with-the-servicerole-secret-BYM4Fa)

## Security notice for this project

The current feature server functions reach this privileged client without a
complete manager-role authorization check. Attaching a browser bearer token in
`src/start.ts` is not enforcement. Before public deployment, validate the user
and the required manager permission on the server before allowing any handler
to call `getAdminDatabase()`.
