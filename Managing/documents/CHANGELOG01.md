# Feature change log

This log records user-facing features and meaningful behavior changes. Update
it whenever a feature is added or changed, alongside any affected architecture
documentation.

## 2026-08-12

### Added: required parent information for student creation

- Added a parent-first, two-tab flow to `StudentDialog`.
- Added required parent first name, last name, email, and phone fields.
- Added client validation before navigating to student details and before save.
- Added matching server-side Zod validation before database writes.
- Replaced placeholder-parent creation with real parent create, email reuse, and
  update behavior.
- Included linked parent information in the shared `Student` DTO so edit,
  renewal, automatic status updates, and tuition flows preserve the relation.
- Added parent fields to the tuition screen's alternate new-student flow.

Verification: `npm.cmd run typecheck`, `npm.cmd run lint`, and
`npm.cmd run build` all passed.

### Changed: shared parent phone validation

- Parent phone fields in the student and tuition dialogs now use the shared
  `IsValidPhoneNumber` rule from `src/Shared/Constraints.ts`.
- The server-side student validator uses the same rule, preventing invalid phone
  numbers from bypassing the dialogs.
- Invalid parent phone numbers now trigger an immediate client-side popup when
  the field loses focus, with an example of the accepted format.
- Invalid phone fields are marked visually and show an inline correction hint.
- Parent validation now returns booleans while the frontend owns all popup
  wording; invalid phone input is stopped before the server mutation begins.
- Added brief code comments linking the shared rule, both UI entry paths, and
  the server-side defense so future maintenance keeps them synchronized.

## 2026-08-13

### Changed: normalized student identity fields

- Corrected the form mapping so parent `Họ` writes to `parents.first_name` and
  parent `Tên` writes to `parents.last_name`.
- Split the student name form into `Họ` (`students.first_name`) and `Tên học`
  (`students.last_name`) instead of storing the whole name in one column.
- Added optional `Tên gọi ở nhà` (`students.aka`) and `Ghi chú`
  (`students.note`) fields to student creation/editing.
- Carried the separate names, `aka`, and `note` through the shared DTO, server
  validator, normalized database adapter, course renewal, status updates, and
  the tuition screen's alternate student flow.
- Added short comments beside the compatibility display-name derivation and
  identity persistence mapping.

Verification: `npm.cmd run typecheck`, `npm.cmd run lint`, and
`npm.cmd run build` all passed.
