// Client-callable RPC definitions; privileged modules are loaded inside handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AttendanceRow, ScheduleChange } from "@/Shared/shared";
import { computeEndDate, slotsPerDayMap } from "@/Shared/shared";
import {
  ClassTypeSchema,
  NumericIdSchema,
  databaseDayToUi,
  joinName,
  numericId,
  shortTime,
} from "@/Shared/Constraints";

async function managerData() {
  return import("@/server/database/manager-data.server");
}

async function adminDatabase() {
  const { getAdminDatabase } = await import("@/server/database/supabase-admin.server");
  return getAdminDatabase();
}

const StudentStatusSchema = z.enum(["Đang học", "Bảo lưu", "Hoàn thành", "Chuẩn bị"]);
const AttendanceStatusSchema = z.enum(["Đi học", "Nghỉ có phép", "Nghỉ không phép", "Bảo lưu"]);
const TimeStringSchema = z.string().regex(/^\d{2}:\d{2}$/, "Sai định dạng HH:MM");
const ScheduleSlotSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: TimeStringSchema,
    end: TimeStringSchema,
  })
  .refine((slot) => slot.start < slot.end, {
    message: "Giờ bắt đầu phải trước giờ kết thúc",
  });

const StudentInputSchema = z
  .object({
    id: NumericIdSchema.optional(),
    name: z.string().trim().min(1).max(120),
    age: z.number().int().min(1).max(120),
    class_type: ClassTypeSchema,
    tuition: z.number().min(0),
    start_date: z.string(),
    end_date: z.string(),
    status: StudentStatusSchema,
    reserve_days: z.number().int().min(0).default(0),
    total_sessions: z.number().int().min(1).max(500),
    course_index: z.number().int().min(1).default(1),
    schedule_slots: z.array(ScheduleSlotSchema).min(1),
    person_id: NumericIdSchema.nullable().optional(),
  })
  .refine(
    (input) => {
      const total = input.schedule_slots.reduce((sum, slot) => {
        const [startHour, startMinute] = slot.start.split(":").map(Number);
        const [endHour, endMinute] = slot.end.split(":").map(Number);
        return sum + Math.max(1, Math.round(((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60));
      }, 0);
      return total >= 2;
    },
    { message: "Học sinh phải học tối thiểu 2 buổi/tuần", path: ["schedule_slots"] },
  )
  .refine(
    (input) => input.schedule_slots.some((slot) => slot.day === new Date(`${input.start_date}T00:00:00`).getDay()),
    { message: "Ngày bắt đầu không trùng lịch học", path: ["start_date"] },
  )
  .refine(
    (input) => input.schedule_slots.some((slot) => slot.day === new Date(`${input.end_date}T00:00:00`).getDay()),
    { message: "Ngày kết thúc không trùng lịch học", path: ["end_date"] },
  );

function toAttendance(row: {
  attendance_id: number;
  enrollment_id: number;
  attendance_date: string;
  status: string;
  note: string | null;
  makeup_date: string | null;
  created_at: string;
}): AttendanceRow {
  return {
    id: String(row.attendance_id),
    student_id: String(row.enrollment_id),
    date: row.attendance_date,
    status: AttendanceStatusSchema.parse(row.status),
    note: row.note,
    makeup_date: row.makeup_date,
    created_at: row.created_at,
  };
}

export const listStudents = createServerFn({ method: "GET" }).handler(async () =>
  (await managerData()).listEnrollmentStudents(),
);

export const upsertStudent = createServerFn({ method: "POST" })
  .validator((value: unknown) => StudentInputSchema.parse(value))
  .handler(async ({ data }) => {
    const id = await (await managerData()).saveEnrollmentStudent(data);
    return { ok: true, id: String(id) };
  });

export const deleteStudent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ id: NumericIdSchema }).parse(value))
  .handler(async ({ data }) => {
    await (await managerData()).deleteEnrollmentStudent(numericId(data.id));
    return { ok: true };
  });

export const listSchedule = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDatabase();
  const [schedulesResult, classesResult] = await Promise.all([
    db.from("class_schedules").select("*").order("day_of_week").order("start_time"),
    db.from("classes").select("class_id,class_name,subject"),
  ]);
  if (schedulesResult.error) throw new Error(schedulesResult.error.message);
  if (classesResult.error) throw new Error(classesResult.error.message);
  const classById = new Map((classesResult.data ?? []).map((row) => [row.class_id, row]));
  return (schedulesResult.data ?? []).map((row) => {
    const classRow = classById.get(row.class_id);
    return {
      id: String(row.schedule_id),
      class_type: ClassTypeSchema.parse(classRow?.subject || classRow?.class_name),
      day_of_week: databaseDayToUi(row.day_of_week),
      start_time: shortTime(row.start_time),
      end_time: shortTime(row.end_time),
      location: row.location,
      created_at: row.created_at,
    };
  });
});

export const listAttendance = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ date: z.string() }).parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { data: rows, error } = await db
      .from("attendance_records")
      .select("*")
      .eq("attendance_date", data.date);
    if (error) throw new Error(error.message);
    return (rows ?? []).map(toAttendance);
  });

export const listAttendanceRange = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ from: z.string(), to: z.string() }).parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { data: rows, error } = await db
      .from("attendance_records")
      .select("*")
      .gte("attendance_date", data.from)
      .lte("attendance_date", data.to);
    if (error) throw new Error(error.message);
    return (rows ?? []).map(toAttendance);
  });

export const listAttendanceByStudent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ student_id: NumericIdSchema }).parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { data: rows, error } = await db
      .from("attendance_records")
      .select("*")
      .eq("enrollment_id", numericId(data.student_id));
    if (error) throw new Error(error.message);
    return (rows ?? []).map(toAttendance);
  });

export const setAttendance = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z
      .object({
        student_id: NumericIdSchema,
        date: z.string(),
        status: AttendanceStatusSchema,
        note: z.string().max(500).nullable().optional(),
        makeup_date: z.string().nullable().optional(),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { error } = await db.from("attendance_records").upsert(
      {
        enrollment_id: numericId(data.student_id),
        attendance_date: data.date,
        status: data.status,
        note: data.note ?? null,
        makeup_date: data.makeup_date ?? null,
      },
      { onConflict: "enrollment_id,attendance_date" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAttendance = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ student_id: NumericIdSchema, date: z.string() }).parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { error } = await db
      .from("attendance_records")
      .delete()
      .eq("enrollment_id", numericId(data.student_id))
      .eq("attendance_date", data.date);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPeople = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDatabase();
  const { data, error } = await db.from("students").select("student_id,first_name,last_name,age,note");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => ({
      id: String(row.student_id),
      name: joinName(row.first_name, row.last_name),
      age: row.age,
      note: row.note,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
});

export const listScheduleChanges = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDatabase();
  const { data, error } = await db
    .from("enrollment_schedule_changes")
    .select("*")
    .order("effective_from", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(
    (row): ScheduleChange => ({
      id: String(row.change_id),
      student_id: String(row.enrollment_id),
      effective_from: row.effective_from,
      old_slots: z.array(ScheduleSlotSchema).parse(row.old_slots),
      new_slots: z.array(ScheduleSlotSchema).parse(row.new_slots),
      reason: row.reason,
      created_at: row.created_at,
    }),
  );
});

export const changeSchedule = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z
      .object({
        student_id: NumericIdSchema,
        effective_from: z.string(),
        new_slots: z.array(ScheduleSlotSchema).min(1),
        reason: z.string().max(300).nullable().optional(),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const student = (await (await managerData()).listEnrollmentStudents()).find((row) => row.id === data.student_id);
    if (!student) throw new Error("Không tìm thấy khóa học");

    const { data: attendance, error: attendanceError } = await db
      .from("attendance_records")
      .select("attendance_date,status")
      .eq("enrollment_id", numericId(data.student_id))
      .gte("attendance_date", student.start_date)
      .lt("attendance_date", data.effective_from);
    if (attendanceError) throw new Error(attendanceError.message);

    const sessionsByDay = slotsPerDayMap(student.schedule_slots);
    let usedSessions = 0;
    for (const row of attendance ?? []) {
      if (row.status !== "Đi học") continue;
      const day = new Date(`${row.attendance_date}T00:00:00`).getDay();
      usedSessions += sessionsByDay.get(day) ?? 1;
    }
    const remainingSessions = Math.max(1, student.total_sessions - usedSessions);
    const endDate = computeEndDate(data.effective_from, data.new_slots, remainingSessions) ?? student.end_date;

    await (await managerData()).saveEnrollmentStudent({
      ...student,
      end_date: endDate,
      schedule_slots: data.new_slots,
    });

    const { error: changeError } = await db.from("enrollment_schedule_changes").insert({
      enrollment_id: numericId(data.student_id),
      effective_from: data.effective_from,
      old_slots: student.schedule_slots.map((slot) => ({ day: slot.day, start: slot.start, end: slot.end })),
      new_slots: data.new_slots.map((slot) => ({ day: slot.day, start: slot.start, end: slot.end })),
      reason: data.reason ?? null,
    });
    if (changeError) throw new Error(changeError.message);
    return { ok: true, end_date: endDate, remain: remainingSessions };
  });

export const deleteScheduleChange = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ id: NumericIdSchema }).parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { error } = await db
      .from("enrollment_schedule_changes")
      .delete()
      .eq("change_id", numericId(data.id));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteReserveDates = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z.object({ student_id: NumericIdSchema, dates: z.array(z.string()).min(1) }).parse(value),
  )
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { error } = await db
      .from("attendance_records")
      .delete()
      .eq("enrollment_id", numericId(data.student_id))
      .eq("status", "Bảo lưu")
      .in("attendance_date", data.dates);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replaceReserveDates = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z
      .object({
        student_id: NumericIdSchema,
        old_dates: z.array(z.string()),
        dates: z.array(z.string()).min(1),
        note: z.string().max(300).nullable().optional(),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const enrollmentId = numericId(data.student_id);
    if (data.old_dates.length > 0) {
      const { error } = await db
        .from("attendance_records")
        .delete()
        .eq("enrollment_id", enrollmentId)
        .eq("status", "Bảo lưu")
        .in("attendance_date", data.old_dates);
      if (error) throw new Error(error.message);
    }

    const rows = data.dates.map((date) => ({
      enrollment_id: enrollmentId,
      attendance_date: date,
      status: "Bảo lưu",
      note: data.note ?? "Bảo lưu theo lịch",
      makeup_date: null,
    }));
    const { error } = await db
      .from("attendance_records")
      .upsert(rows, { onConflict: "enrollment_id,attendance_date" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
