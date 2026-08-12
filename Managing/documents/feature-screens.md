# Feature screen guide

Each file in this directory is one top-level product feature displayed by
`AppTabs`. The tab modules are lazy-loaded, so avoid importing one feature screen
from another feature screen; shared code belongs in `src/Shared` or a deliberately
shared component.

## Recommended internal layout

For a small feature, one `FeatureTab.tsx` file is fine. As it grows, turn it into
a folder while preserving the public named export:

```text
FeatureTab.tsx             # orchestration and the exported FeatureTab component
feature/
  FeatureTable.tsx         # display-only table/card
  FeatureDialog.tsx        # one form and its mutation
  useFeatureData.ts        # related query composition, when genuinely reusable
  types.ts                 # feature-only view models
```

The orchestrating tab should answer three questions at a glance:

1. What data does this feature load?
2. What top-level filters or modes does it own?
3. Which focused components make up the screen?

## State placement

- Keep temporary form state inside the dialog that edits it.
- Keep screen filters in the top-level feature component.
- Keep server state in TanStack Query, not duplicated in `useState`.
- Keep cross-feature business calculations as pure functions in
  `src/Shared/shared.ts`.
- Do not create a class-based service for React state. Server functions already
  provide the remote use-case API.

## Data flow

Feature components call a bound server function with `useServerFn`, then use it
inside `useQuery` or `useMutation`. Inputs are validated on the server. List
endpoints normalize database JSON columns into domain types before returning,
so UI code should not add `as any` casts.

After a mutation, invalidate the relevant query root. For example, a student
write invalidates `["students"]`; an operation affecting both a payment and a
student invalidates both roots.

## Comments

Comment lifecycle assumptions and business rules, such as why a student is
automatically promoted or how reserve sessions affect a course end date. Do not
comment routine JSX structure or restate function names.
