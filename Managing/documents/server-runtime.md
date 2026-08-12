# Server runtime and server-only modules

`src/server` is a directory for code that must never run in the browser. It is
different from the sibling file `src/server.ts`:

| Path                    | Meaning                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `src/server.ts`         | The outer TanStack/Nitro fetch entry for the entire application          |
| `src/server/`           | Private implementation modules used by browser-callable server functions |
| `src/server/database/`  | Privileged Supabase client and normalized data adapter                   |
| `src/server-functions/` | Public application-operation boundary implemented with `createServerFn`  |

The server functions are currently kept in the top-level
`src/server-functions` directory rather than nested at `src/server/functions`.
This matches existing imports and avoids a behavior-changing move during the
database migration. A later rename can be done mechanically if a single nested
server tree is preferred.

Related documentation:

- [`database-layer.md`](./database-layer.md) for database behavior;
- [`server-functions.md`](./server-functions.md) for the callable API;
- [`architecture.md`](./architecture.md) for the complete request flow.
