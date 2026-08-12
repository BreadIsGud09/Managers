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

## Student creation and parent information

`StudentDialog.tsx` uses a parent-first, two-tab flow:

1. **Thông tin phụ huynh** collects the required first name, last name, email,
   and phone number.
2. **Thông tin học sinh** collects the student and course details.

The Vietnamese labels intentionally map to the normalized name columns as
follows:

| Form field        | Database column       |
| ----------------- | --------------------- |
| Parent `Họ`       | `parents.first_name`  |
| Parent `Tên`      | `parents.last_name`   |
| Student `Họ`      | `students.first_name` |
| Student `Tên học` | `students.last_name`  |
| `Tên gọi ở nhà`   | `students.aka`        |
| `Ghi chú`         | `students.note`       |

`Student.name` is derived by joining the two student name columns for existing
screens; it is not stored as a separate database column. `aka` and `note` are
optional identity fields and are preserved when another course is created for
the same student.

The **Tiếp tục** action validates the parent fields before moving forward. The
**Lưu** action checks the parent and student fields again before calling the
server. `StudentInputSchema` repeats the validation at the server boundary, so
a client cannot bypass the required relationship. Editing a student preloads
the linked parent record.

## Comments

Comment lifecycle assumptions and business rules, such as why a student is
automatically promoted or how reserve sessions affect a course end date. Do not
comment routine JSX structure or restate function names.
