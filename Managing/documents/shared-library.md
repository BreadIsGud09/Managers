# Shared library modules

`src/Shared` is still active, but it is no longer the database/API layer. It holds
code that is shared by more than one feature or runtime boundary.

## Current files

| File                         | Runtime            | Responsibility                                                                                                                                   |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared.ts`                  | Browser and server | Domain types plus pure scheduling, date, status, grouping, and display calculations                                                              |
| `Constraints.ts`             | Browser and server | Small conversion and validation rules between UI values and normalized DB values: numeric IDs, names, weekdays, times, statuses, and class types |
| `export.ts`                  | Browser            | XLSX/CSV creation and file download helpers                                                                                                      |
| `utils.ts`                   | Browser/UI         | `cn()` class-name merging used by the UI component library                                                                                       |
| `error-capture.ts`           | Server             | Temporarily preserves an original runtime error when h3 converts it into a generic response                                                      |
| `error-page.ts`              | Server             | Produces the fallback HTML used for catastrophic server/SSR failures                                                                             |
| `lovable-error-reporting.ts` | Browser            | Sends React error-boundary failures to Lovable's optional browser event hook                                                                     |

## What belongs here

- A type or pure calculation used by several features.
- A framework-independent formatter or converter.
- A small infrastructure helper shared by server entry files.

Database queries do not belong here. Browser-callable remote operations belong
in `src/server-functions`; privileged Supabase access and normalized relation
mapping belong in `src/server/database`.

## Objects and classes

This project uses TypeScript interfaces and plain objects rather than domain
classes:

- `Student`, `AttendanceRow`, `LearningLog`, and similar interfaces define the
  DTO shapes exchanged between the UI and server functions.
- Interfaces disappear after TypeScript compilation; they are not ORM models.
- Zod schemas provide runtime validation where data crosses a trust boundary.
- Supabase generated types describe table rows, inserts, and updates.

The design is functional because calculations such as `computeEndDate` and
`groupByPerson` do not require mutable object state. If a future domain concept
needs protected invariants and meaningful behavior tied to an instance, a
class or value object may be justified; it is not required merely to organize
database calls.
