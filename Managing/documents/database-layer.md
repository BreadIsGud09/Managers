# Supabase server database layer

This directory is the server-only data-access layer for Supabase. It answers:
"How is an application operation represented by the normalized PostgreSQL
schema?"

It does **not** define browser-callable endpoints. Those live in
`src/server-functions`; see [`server-functions.md`](./server-functions.md).

## Files

| File                       | Responsibility                                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase-admin.server.ts` | Lazily creates one typed Supabase client from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The secret key is server-only and bypasses RLS. Its object lifecycle is detailed in [`supabase-admin-client-lifecycle.md`](./supabase-admin-client-lifecycle.md). |
| `manager-data.server.ts`   | Maps the existing course-oriented UI model to and from the normalized Manager tables.                                                                                                                                                                           |

The `.server.ts` suffix is an ownership warning: browser components must not
import these modules.

The admin module manages a reusable Supabase **client**, not DTOs, query
builders, a direct PostgreSQL connection, or a transaction. See
[`supabase-admin-client-lifecycle.md`](./supabase-admin-client-lifecycle.md) for
the distinction.

## Data model translated by `manager-data.server.ts`

The UI inherited a flat object named `Student`, but one UI row actually means
"one student's enrollment in one course":

```text
parents
  -> students                         person identity
      -> enrollments                  course instance shown by the UI
          -> classes                  Piano, Múa, or Vẽ
          -> class_levels             course/level number
          -> enrollment_schedules
              -> class_schedules      weekly time slots
```

This creates an important identifier rule:

| Application field   | Database identifier         | Meaning                            |
| ------------------- | --------------------------- | ---------------------------------- |
| `Student.id`        | `enrollments.enrollment_id` | The course enrollment being edited |
| `Student.person_id` | `students.student_id`       | The reusable person identity       |

Student identity details stay on `students`: `first_name`, `last_name`, `aka`,
`age`, and `note`. The adapter exposes a combined `Student.name` for legacy UI
screens while retaining the separate name columns for editing and persistence.

Attendance, learning logs, and tuition payments also point to the enrollment,
because they belong to a specific course rather than only to the person.

## What each function does

| Function                      | Database behavior                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `statusFromDatabase`          | Converts core enrollment statuses plus `status_detail` into the Vietnamese UI status.                                   |
| `findClassByType`             | Finds the seeded class row matching Piano, Múa, or Vẽ.                                                                  |
| `findOrCreateClassLevel`      | Reuses or creates a `class_levels` record for the course number.                                                        |
| `saveParent`                  | Updates a supplied parent, reuses a parent with the same email, or creates a required parent record.                    |
| `findOrCreateStudentIdentity` | Updates a supplied student identity or reuses/creates an identity under the resolved parent.                            |
| `listEnrollmentStudents`      | Reads seven normalized relations in parallel and includes parent details in the flat `Student[]` DTO consumed by React. |
| `saveEnrollmentStudent`       | Creates/updates parent, identity, level, enrollment, weekly schedule rows, and enrollment-to-schedule links.            |
| `deleteEnrollmentStudent`     | Deletes tuition-payment income rows and the enrollment, while retaining the reusable student and parent identities.     |

### Read flow

`listEnrollmentStudents` reads `enrollments`, `students`, `parents`, `classes`,
`class_levels`, `enrollment_schedules`, and `class_schedules`. It builds `Map`
objects keyed by their numeric IDs, then returns application DTOs containing the
linked parent information. These maps are temporary lookup objects, not service
classes and not database tables.

### Write flow

`saveEnrollmentStudent` performs these operations:

1. Validate required parent and student fields in the server function.
2. Update, reuse by email, or create the parent record.
3. Resolve or create the normalized student identity under that parent,
   including separate name columns, `aka`, and `note`.
4. Resolve the selected class and course level.
5. Insert or update the enrollment.
6. Upsert reusable weekly class-schedule rows.
7. Replace the enrollment's schedule-link rows.

The sequence uses several Supabase Data API requests, not one database
transaction. Failure halfway through can leave an intermediate row.

## Security boundary

`getAdminDatabase()` uses the Supabase secret/service-role key, which bypasses
Row Level Security. Only validated, authenticated, authorized server functions
should be able to reach it. Attaching a browser token is not by itself an
authorization check; see [`server-functions.md`](./server-functions.md).

## Why there is no database class

The application has no long-lived repository object with per-request state.
Small exported functions compose directly with TanStack server functions, and
the Supabase client is already a typed object managed as a lazy singleton.
Adding a class would add ceremony without creating a stronger boundary. The
directory and `.server.ts` suffix provide the boundary; TypeScript types and
Zod schemas define the contracts.
