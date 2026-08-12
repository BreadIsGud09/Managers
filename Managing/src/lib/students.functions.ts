import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";
import type { ScheduleChange, Student } from "@/lib/shared";

const ClassType = z.enum(["Piano", "Múa", "Vẽ"]);
const StudentStatus = z.enum(["Đang học", "Bảo lưu", "Hoàn thành", "Chuẩn bị"]);
const AttendanceStatus = z.enum(["Đi học", "Nghỉ có phép", "Nghỉ không phép", "Bảo lưu"]);


const TimeStr = z.string().regex(/^\d{2}:\d{2}$/, "Sai định dạng HH:MM");
const ScheduleSlot = z.object({
  day: z.number().int().min(0).max(6),
  start: TimeStr,
  end: TimeStr,
}).refine((s) => s.start < s.end, { message: "Giờ bắt đầu phải trước giờ kết thúc" });

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type StudentRow = Database["public"]["Tables"]["students"]["Row"];
type ScheduleChangeRow = Database["public"]["Tables"]["schedule_changes"]["Row"];

/** Converts database JSON fields into the DTO consumed by feature components. */
function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    class_type: row.class_type,
    tuition: row.tuition,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    reserve_days: row.reserve_days,
    total_sessions: row.total_sessions,
    schedule_days: row.schedule_days,
    sessions_per_day: row.sessions_per_day === 2 ? 2 : 1,
    schedule_slots: z.array(ScheduleSlot).parse(row.schedule_slots ?? []),
    course_index: row.course_index,
    person_id: row.person_id,
  };
}

function toScheduleChange(row: ScheduleChangeRow): ScheduleChange {
  return {
    ...row,
    old_slots: z.array(ScheduleSlot).parse(row.old_slots ?? []),
    new_slots: z.array(ScheduleSlot).parse(row.new_slots ?? []),
  };
}

export const listStudents = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb.from("students").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toStudent);
});

const StudentInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  age: z.number().int().min(1).max(120),
  class_type: ClassType,
  tuition: z.number().min(0),
  start_date: z.string(),
  end_date: z.string(),
  status: StudentStatus,
  reserve_days: z.number().int().min(0).default(0),
  total_sessions: z.number().int().min(1).max(500),
  course_index: z.number().int().min(1).default(1),
  schedule_slots: z.array(ScheduleSlot).min(1),
  person_id: z.string().uuid().nullable().optional(),
}).refine((d) => {
  // Tối thiểu 2 buổi/tuần (1 giờ = 1 buổi)
  const total = d.schedule_slots.reduce((acc, s) => {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    return acc + Math.max(1, Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60));
  }, 0);
  return total >= 2;
}, { message: "Học sinh phải học tối thiểu 2 buổi/tuần", path: ["schedule_slots"] })
  .refine((d) => {
  const dow = new Date(d.start_date + "T00:00:00").getDay();
  return d.schedule_slots.some((s) => s.day === dow);
}, { message: "Ngày bắt đầu không trùng lịch học", path: ["start_date"] })
  .refine((d) => {
    const dow = new Date(d.end_date + "T00:00:00").getDay();
    return d.schedule_slots.some((s) => s.day === dow);
  }, { message: "Ngày kết thúc không trùng lịch học", path: ["end_date"] });

function derive(slots: { day: number }[]) {
  const days = Array.from(new Set(slots.map((s) => s.day))).sort();
  const perDay = new Map<number, number>();
  for (const s of slots) perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1);
  const maxPerDay = Math.max(...perDay.values(), 1);
  return { schedule_days: days, sessions_per_day: Math.min(maxPerDay, 2) };
}

export const upsertStudent = createServerFn({ method: "POST" })
  .validator((d: unknown) => StudentInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { schedule_days, sessions_per_day } = derive(data.schedule_slots);
    // Hồ sơ học sinh: dùng person_id nếu có, nếu không thì gộp theo tên + tuổi
    let person_id = data.person_id ?? null;
    if (!person_id) {
      const { data: found } = await sb
        .from("people")
        .select("id")
        .ilike("name", data.name.trim())
        .eq("age", data.age)
        .maybeSingle();
      if (found?.id) person_id = found.id;
      else {
        const { data: created, error: pe } = await sb
          .from("people")
          .insert({ name: data.name.trim(), age: data.age })
          .select("id")
          .single();
        if (pe) throw new Error(pe.message);
        person_id = created?.id ?? null;
      }
    } else {
      await sb.from("people").update({ name: data.name.trim(), age: data.age }).eq("id", person_id);
    }
    const payload = { ...data, person_id, schedule_days, sessions_per_day };
    if (data.id) {
      const { error } = await sb.from("students").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { id: _ignore, ...insert } = payload;
    const { data: row, error } = await sb.from("students").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row?.id as string };
  });

export const deleteStudent = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb.from("students").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSchedule = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb.from("class_schedule").select("*").order("day_of_week").order("start_time");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listAttendance = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ date: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await sb.from("attendance").select("*").eq("date", data.date);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listAttendanceRange = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ from: z.string(), to: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await sb.from("attendance").select("*").gte("date", data.from).lte("date", data.to);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listAttendanceByStudent = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ student_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await sb.from("attendance").select("*").eq("student_id", data.student_id);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setAttendance = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({
      student_id: z.string().uuid(),
      date: z.string(),
      status: AttendanceStatus,
      note: z.string().max(500).nullable().optional(),
      makeup_date: z.string().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const payload = {
      student_id: data.student_id,
      date: data.date,
      status: data.status,
      note: data.note ?? null,
      makeup_date: data.makeup_date ?? null,
    };
    const { error } = await sb.from("attendance").upsert(payload, { onConflict: "student_id,date" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAttendance = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ student_id: z.string().uuid(), date: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb.from("attendance").delete().eq("student_id", data.student_id).eq("date", data.date);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


/** ===== Hồ sơ học sinh ===== */
export const listPeople = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb.from("people").select("*").order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
});

/** ===== Đổi lịch học (giữ lịch sử) ===== */
export const listScheduleChanges = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb
    .from("schedule_changes")
    .select("*")
    .order("effective_from", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toScheduleChange);
});

export const changeSchedule = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({
      student_id: z.string().uuid(),
      effective_from: z.string(),
      new_slots: z.array(ScheduleSlot).min(1),
      reason: z.string().max(300).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { computeEndDate, slotsPerDayMap } = await import("@/lib/shared");
    const sb = await admin();
    const { data: st, error: e1 } = await sb.from("students").select("*").eq("id", data.student_id).single();
    if (e1 || !st) throw new Error(e1?.message ?? "Không tìm thấy khóa học");

    const oldSlots = z.array(ScheduleSlot).parse(st.schedule_slots ?? []);
    // Số buổi đã học trước ngày hiệu lực (1 giờ = 1 buổi)
    const { data: att } = await sb
      .from("attendance")
      .select("date,status")
      .eq("student_id", data.student_id)
      .gte("date", st.start_date)
      .lt("date", data.effective_from);
    const perDay = slotsPerDayMap(oldSlots);
    let used = 0;
    for (const r of att ?? []) {
      if (r.status !== "Đi học") continue;
      const dow = new Date(r.date + "T00:00:00").getDay();
      used += perDay.get(dow) ?? 1;
    }
    const remain = Math.max(1, (st.total_sessions ?? 0) - used);
    const newEnd = computeEndDate(data.effective_from, data.new_slots, remain) ?? st.end_date;

    const { error: e2 } = await sb.from("schedule_changes").insert({
      student_id: data.student_id,
      effective_from: data.effective_from,
      old_slots: oldSlots,
      new_slots: data.new_slots,
      reason: data.reason ?? null,
    });
    if (e2) throw new Error(e2.message);

    const { schedule_days, sessions_per_day } = derive(data.new_slots);
    const { error: e3 } = await sb
      .from("students")
      .update({ schedule_slots: data.new_slots, schedule_days, sessions_per_day, end_date: newEnd })
      .eq("id", data.student_id);
    if (e3) throw new Error(e3.message);
    return { ok: true, end_date: newEnd, remain };
  });

export const deleteScheduleChange = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb.from("schedule_changes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** ===== Bảo lưu: sửa / xóa ===== */
export const deleteReserveDates = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ student_id: z.string().uuid(), dates: z.array(z.string()).min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb
      .from("attendance")
      .delete()
      .eq("student_id", data.student_id)
      .eq("status", "Bảo lưu")
      .in("date", data.dates);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replaceReserveDates = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({
      student_id: z.string().uuid(),
      old_dates: z.array(z.string()),
      dates: z.array(z.string()).min(1),
      note: z.string().max(300).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    if (data.old_dates.length > 0) {
      const { error } = await sb
        .from("attendance")
        .delete()
        .eq("student_id", data.student_id)
        .eq("status", "Bảo lưu")
        .in("date", data.old_dates);
      if (error) throw new Error(error.message);
    }
    const rows = data.dates.map((d) => ({
      student_id: data.student_id,
      date: d,
      status: "Bảo lưu" as const,
      note: data.note ?? "Bảo lưu theo lịch",
      makeup_date: null,
    }));
    const { error: e2 } = await sb.from("attendance").upsert(rows, { onConflict: "student_id,date" });
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });
