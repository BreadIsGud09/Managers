// Client-callable RPC definitions; privileged modules are loaded inside handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function managerData() {
  return import("@/server/database/manager-data.server");
}

async function adminDatabase() {
  const { getAdminDatabase } = await import("@/server/database/supabase-admin.server");
  return getAdminDatabase();
}

const DAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export const getTelegramStatus = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDatabase();
  const { data, error } = await db
    .from("notification_settings")
    .select("telegram_bot_token,telegram_chat_id")
    .eq("settings_id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    configured: Boolean(data?.telegram_bot_token && data.telegram_chat_id),
    chat_id: data?.telegram_chat_id ?? "",
    has_token: Boolean(data?.telegram_bot_token),
  };
});

export const saveTelegramConfig = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z
      .object({
        bot_token: z.string().trim().min(10).max(200),
        chat_id: z.string().trim().min(1).max(50),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { error } = await db.from("notification_settings").upsert({
      settings_id: 1,
      telegram_bot_token: data.bot_token,
      telegram_chat_id: data.chat_id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function sendTelegram(text: string) {
  const db = await adminDatabase();
  const { data, error } = await db
    .from("notification_settings")
    .select("telegram_bot_token,telegram_chat_id")
    .eq("settings_id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.telegram_bot_token || !data.telegram_chat_id) {
    throw new Error("Chưa cấu hình Telegram Bot Token và Chat ID");
  }

  const response = await fetch(`https://api.telegram.org/bot${data.telegram_bot_token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: data.telegram_chat_id, text, parse_mode: "HTML" }),
  });
  const body: unknown = await response.json().catch(() => null);
  const telegramResponse = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  if (!response.ok || telegramResponse?.ok === false) {
    const description =
      typeof telegramResponse?.description === "string" ? telegramResponse.description : response.statusText;
    throw new Error(`Telegram lỗi: ${description}`);
  }
  return { ok: true };
}

export const sendTodayScheduleTelegram = createServerFn({ method: "POST" }).handler(async () => {
  const today = new Date();
  const day = today.getDay();
  const students = (await (await managerData()).listEnrollmentStudents()).filter(
    (student) => student.status === "Đang học",
  );
  const items = students
    .flatMap((student) =>
      student.schedule_slots
        .filter((slot) => slot.day === day)
        .map((slot) => ({
          name: student.name,
          classType: student.class_type,
          start: slot.start,
          end: slot.end,
        })),
    )
    .sort((a, b) => a.start.localeCompare(b.start));

  let text = `📅 <b>Lịch học hôm nay - ${DAYS[day]}, ${today.toLocaleDateString("vi-VN")}</b>\n\n`;
  if (items.length === 0) {
    text += "Hôm nay không có lịch học.";
  } else {
    const byClass = new Map<string, typeof items>();
    for (const item of items) {
      const group = byClass.get(item.classType) ?? [];
      group.push(item);
      byClass.set(item.classType, group);
    }
    for (const [classType, group] of byClass) {
      text += `🎵 <b>Lớp ${classType}</b>\n`;
      for (const item of group) text += `  • ${item.start}–${item.end}  ${item.name}\n`;
      text += "\n";
    }
  }
  return sendTelegram(text);
});

export const sendExpiringTelegram = createServerFn({ method: "POST" }).handler(async () => {
  const students = (await (await managerData()).listEnrollmentStudents()).filter(
    (student) => student.status === "Đang học",
  );
  const start = new Date(new Date().toDateString());
  const cutoff = new Date(start);
  cutoff.setDate(start.getDate() + 5);
  const expiring = students.filter((student) => {
    const endingDate = new Date(`${student.end_date}T00:00:00`);
    return endingDate >= start && endingDate <= cutoff;
  });

  let text = "🔔 <b>Nhắc nhở đóng học phí</b>\n\n";
  if (expiring.length === 0) {
    text += "Không có học sinh nào sắp đến hạn trong 5 ngày tới.";
  } else {
    for (const student of expiring) {
      text += `👤 <b>${student.name}</b> - Lớp ${student.class_type}\n`;
      text += `📆 Hết hạn: ${new Date(`${student.end_date}T00:00:00`).toLocaleDateString("vi-VN")}\n`;
      text += `💰 Học phí: ${Number(student.tuition).toLocaleString("vi-VN")}đ\n\n`;
    }
  }
  return sendTelegram(text);
});

export const sendAttendanceReportTelegram = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ date: z.string() }).parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const [attendanceResult, students] = await Promise.all([
      db
        .from("attendance_records")
        .select("enrollment_id,status")
        .eq("attendance_date", data.date),
      (await managerData()).listEnrollmentStudents(),
    ]);
    if (attendanceResult.error) throw new Error(attendanceResult.error.message);
    const studentById = new Map(students.map((student) => [student.id, student]));
    const day = new Date(`${data.date}T00:00:00`).getDay();
    const attended = (attendanceResult.data ?? []).filter((row) => row.status === "Đi học");

    let text = `✅ <b>Điểm danh đúng giờ - ${new Date(`${data.date}T00:00:00`).toLocaleDateString("vi-VN")}</b>\n\n`;
    if (attended.length === 0) {
      text += "Chưa có học sinh nào điểm danh đi học.";
    } else {
      for (const attendance of attended) {
        const student = studentById.get(String(attendance.enrollment_id));
        if (!student) continue;
        const slot = student.schedule_slots.find((candidate) => candidate.day === day);
        const range = slot ? `${slot.start}–${slot.end}` : "";
        text += `👤 <b>${student.name}</b> · Lớp ${student.class_type}${range ? ` · ⏰ ${range}` : ""}\n`;
      }
    }
    return sendTelegram(text);
  });

export const sendCustomTelegram = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ text: z.string().trim().min(1).max(4000) }).parse(value))
  .handler(async ({ data }) => sendTelegram(data.text));
