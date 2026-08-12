/**
 * Server-only adapter between the application's course-oriented `Student`
 * object and the normalized Manager database.
 *
 * The UI calls one course enrollment a `Student`. In PostgreSQL that object is
 * assembled from `students` (person identity), `enrollments` (course),
 * `classes`, `class_levels`, `class_schedules`, and `enrollment_schedules`.
 * Consequently, `Student.id` is an `enrollment_id`, while
 * `Student.person_id` is a `student_id`.
 *
 * This module uses the privileged client from `supabase-admin.server.ts` and
 * must never be imported by browser components. Public request validation
 * belongs in `src/server-functions`; this file only performs database mapping
 * and persistence.
 *
 * See `src/server/database/README.md` for the complete read/write flow.
 */
import { z } from "zod";

import type { Student, StudentStatus } from "@/Shared/shared";
import { maxPerDay, uniqueDays } from "@/Shared/shared";
import {
  ClassTypeSchema,
  databaseDayToUi,
  joinName,
  numericId,
  shortTime,
  statusToDatabase,
  uiDayToDatabase,
  type ManagerClassType,
} from "@/Shared/Constraints";
import { getAdminDatabase } from "@/server/database/supabase-admin.server";

/** Prefer the UI-specific detail, but remain compatible with core DB statuses. */
function statusFromDatabase(coreStatus: string, detail: string | null): StudentStatus {
  const display = z
    .enum(["Đang học", "Bảo lưu", "Hoàn thành", "Chuẩn bị", "Nghỉ phép", "Kết thúc"])
    .safeParse(detail);
  if (display.success) return display.data;

  if (coreStatus === "PendingSchedule") return "Chuẩn bị";
  if (coreStatus === "Completed") return "Hoàn thành";
  if (coreStatus === "Cancelled") return "Bảo lưu";
  return "Đang học";
}

/** Resolve the seeded normalized class row used by a UI class type. */
export async function findClassByType(classType: ManagerClassType) {
  const db = getAdminDatabase();
  const { data, error } = await db
    .from("classes")
    .select("class_id,class_name,subject,fee")
    .eq("class_name", classType)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Missing normalized class row for ${classType}`);
  return data;
}

/** Resolve a course number to a class-level row, creating the row when absent. */
async function findOrCreateClassLevel(classId: number, courseIndex: number): Promise<number> {
  const db = getAdminDatabase();
  const level = String(courseIndex);
  const { data: found, error: findError } = await db
    .from("class_levels")
    .select("class_level_id")
    .eq("class_id", classId)
    .eq("level", level)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (found) return found.class_level_id;

  const { data, error } = await db
    .from("class_levels")
    .insert({ class_id: classId, level, requirement: null })
    .select("class_level_id")
    .single();
  if (error) throw new Error(error.message);
  return data.class_level_id;
}

/**
 * Reuse/update an existing person identity or create one for a new enrollment.
 * The current schema requires a parent, so a placeholder parent is created when
 * the UI has no parent information. This is compatibility behavior, not a
 * complete parent-management workflow.
 */
async function findOrCreateStudentIdentity(input: {
  personId?: string | null;
  name: string;
  age: number;
}): Promise<number> {
  const db = getAdminDatabase();
  const normalizedName = input.name.trim();

  if (input.personId) {
    const studentId = numericId(input.personId);
    const { error } = await db
      .from("students")
      .update({ first_name: normalizedName, last_name: "", age: input.age })
      .eq("student_id", studentId);
    if (error) throw new Error(error.message);
    return studentId;
  }

  const { data: identities, error: listError } = await db
    .from("students")
    .select("student_id,first_name,last_name,age");
  if (listError) throw new Error(listError.message);
  const existing = (identities ?? []).find(
    (row) => row.age === input.age && joinName(row.first_name, row.last_name).toLocaleLowerCase("vi") === normalizedName.toLocaleLowerCase("vi"),
  );
  if (existing) return existing.student_id;

  const uniquePart = crypto.randomUUID();
  const { data: parent, error: parentError } = await db
    .from("parents")
    .insert({
      first_name: "Unknown",
      last_name: "Parent",
      email: `student-${uniquePart}@invalid.local`,
      phone_number: "",
    })
    .select("parent_id")
    .single();
  if (parentError) throw new Error(parentError.message);

  const { data: identity, error: studentError } = await db
    .from("students")
    .insert({
      parent_id: parent.parent_id,
      first_name: normalizedName,
      last_name: "",
      age: input.age,
      note: null,
    })
    .select("student_id")
    .single();
  if (studentError) throw new Error(studentError.message);
  return identity.student_id;
}

/**
 * Read normalized relations and assemble the flat `Student[]` DTO expected by
 * the existing React screens. Independent reads run in parallel; in-memory
 * maps perform the joins without leaking database row shapes to the UI.
 */
export async function listEnrollmentStudents(): Promise<Student[]> {
  const db = getAdminDatabase();
  const [enrollmentsResult, studentsResult, classesResult, levelsResult, linksResult, schedulesResult] =
    await Promise.all([
      db.from("enrollments").select("*").order("created_at", { ascending: false }),
      db.from("students").select("*"),
      db.from("classes").select("class_id,class_name,subject"),
      db.from("class_levels").select("class_level_id,level"),
      db.from("enrollment_schedules").select("enrollment_id,schedule_id"),
      db.from("class_schedules").select("schedule_id,day_of_week,start_time,end_time"),
    ]);

  const firstError = [enrollmentsResult, studentsResult, classesResult, levelsResult, linksResult, schedulesResult]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) throw new Error(firstError.message);

  const identityById = new Map((studentsResult.data ?? []).map((row) => [row.student_id, row]));
  const classById = new Map((classesResult.data ?? []).map((row) => [row.class_id, row]));
  const levelById = new Map((levelsResult.data ?? []).map((row) => [row.class_level_id, row.level]));
  const scheduleById = new Map((schedulesResult.data ?? []).map((row) => [row.schedule_id, row]));
  const scheduleIdsByEnrollment = new Map<number, number[]>();
  for (const link of linksResult.data ?? []) {
    const ids = scheduleIdsByEnrollment.get(link.enrollment_id) ?? [];
    ids.push(link.schedule_id);
    scheduleIdsByEnrollment.set(link.enrollment_id, ids);
  }

  return (enrollmentsResult.data ?? []).map((enrollment): Student => {
    const identity = identityById.get(enrollment.student_id);
    const classRow = classById.get(enrollment.class_id);
    if (!identity || !classRow) throw new Error(`Broken enrollment relation for ${enrollment.enrollment_id}`);

    const classType = ClassTypeSchema.parse(classRow.subject || classRow.class_name);
    const scheduleSlots = (scheduleIdsByEnrollment.get(enrollment.enrollment_id) ?? [])
      .map((scheduleId) => scheduleById.get(scheduleId))
      .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot))
      .map((slot) => ({
        day: databaseDayToUi(slot.day_of_week),
        start: shortTime(slot.start_time),
        end: shortTime(slot.end_time),
      }))
      .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));

    const parsedLevel = Number.parseInt(levelById.get(enrollment.class_level_id) ?? "1", 10);
    return {
      id: String(enrollment.enrollment_id),
      person_id: String(identity.student_id),
      name: joinName(identity.first_name, identity.last_name),
      age: identity.age,
      class_type: classType,
      tuition: Number(enrollment.agreed_fee),
      start_date: enrollment.enroll_date,
      end_date: enrollment.ending_date ?? enrollment.enroll_date,
      status: statusFromDatabase(enrollment.status, enrollment.status_detail),
      reserve_days: enrollment.reserve_days,
      total_sessions: enrollment.total_sessions,
      schedule_days: uniqueDays(scheduleSlots),
      sessions_per_day: maxPerDay(scheduleSlots),
      schedule_slots: scheduleSlots,
      course_index: Number.isFinite(parsedLevel) && parsedLevel > 0 ? parsedLevel : 1,
    };
  });
}

/**
 * Create or update one course enrollment and replace its assigned weekly
 * schedule links. This may also create a student identity, placeholder parent,
 * class level, or reusable class-schedule rows required by the normalized
 * model.
 *
 * These writes currently span several Data API requests and are not wrapped in
 * one PostgreSQL transaction. A failed later request can therefore leave an
 * incomplete intermediate record that must be repaired.
 */
export async function saveEnrollmentStudent(input: {
  id?: string;
  person_id?: string | null;
  name: string;
  age: number;
  class_type: ManagerClassType;
  tuition: number;
  start_date: string;
  end_date: string;
  status: StudentStatus;
  reserve_days: number;
  total_sessions: number;
  course_index: number;
  schedule_slots: Array<{ day: number; start: string; end: string }>;
}): Promise<number> {
  const db = getAdminDatabase();
  const studentId = await findOrCreateStudentIdentity({
    personId: input.person_id,
    name: input.name,
    age: input.age,
  });
  const classRow = await findClassByType(input.class_type);
  const classLevelId = await findOrCreateClassLevel(classRow.class_id, input.course_index);
  const enrollmentPayload = {
    student_id: studentId,
    class_id: classRow.class_id,
    class_level_id: classLevelId,
    enroll_date: input.start_date,
    ending_date: input.end_date,
    status: statusToDatabase(input.status),
    status_detail: input.status,
    agreed_fee: input.tuition,
    reserve_days: input.reserve_days,
    total_sessions: input.total_sessions,
  };

  let enrollmentId: number;
  if (input.id) {
    enrollmentId = numericId(input.id);
    const { error } = await db.from("enrollments").update(enrollmentPayload).eq("enrollment_id", enrollmentId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await db
      .from("enrollments")
      .insert(enrollmentPayload)
      .select("enrollment_id")
      .single();
    if (error) throw new Error(error.message);
    enrollmentId = data.enrollment_id;
  }

  const scheduleIds: number[] = [];
  for (const slot of input.schedule_slots) {
    const { data, error } = await db
      .from("class_schedules")
      .upsert(
        {
          class_id: classRow.class_id,
          day_of_week: uiDayToDatabase(slot.day),
          start_time: slot.start,
          end_time: slot.end,
          student_capacity: 20,
          is_active: true,
          location: null,
        },
        { onConflict: "class_id,day_of_week,start_time,end_time" },
      )
      .select("schedule_id")
      .single();
    if (error) throw new Error(error.message);
    scheduleIds.push(data.schedule_id);
  }

  const { error: unlinkError } = await db
    .from("enrollment_schedules")
    .delete()
    .eq("enrollment_id", enrollmentId);
  if (unlinkError) throw new Error(unlinkError.message);

  const links = scheduleIds.map((scheduleId) => ({
    enrollment_id: enrollmentId,
    schedule_id: scheduleId,
    class_id: classRow.class_id,
  }));
  if (links.length > 0) {
    const { error: linkError } = await db.from("enrollment_schedules").insert(links);
    if (linkError) throw new Error(linkError.message);
  }

  return enrollmentId;
}

/**
 * Delete tuition-origin income rows for an enrollment, then delete the
 * enrollment. The normalized student identity and parent are intentionally
 * retained because they can be shared by other enrollments.
 */
export async function deleteEnrollmentStudent(enrollmentId: number) {
  const db = getAdminDatabase();
  const { error: paymentError } = await db
    .from("income_transactions")
    .delete()
    .eq("enrollment_id", enrollmentId)
    .eq("entry_origin", "tuition_payment");
  if (paymentError) throw new Error(paymentError.message);

  const { error } = await db.from("enrollments").delete().eq("enrollment_id", enrollmentId);
  if (error) throw new Error(error.message);
}
