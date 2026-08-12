import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type ScheduleSlot = { day: number; start: string; end: string };

function isScheduleSlot(value: unknown): value is ScheduleSlot {
  if (typeof value !== "object" || value === null) return false;
  const slot = value as Record<string, unknown>;
  return typeof slot.day === "number" && typeof slot.start === "string" && typeof slot.end === "string";
}

function readScheduleSlots(value: unknown): ScheduleSlot[] {
  return Array.isArray(value) ? value.filter(isScheduleSlot) : [];
}

export const getTelegramStatus = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb.from("telegram_settings").select("bot_token,chat_id").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return {
    configured: Boolean(data?.bot_token && data?.chat_id),
    chat_id: data?.chat_id ?? "",
    has_token: Boolean(data?.bot_token),
  };
});

export const saveTelegramConfig = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({
      bot_token: z.string().trim().min(10).max(200),
      chat_id: z.string().trim().min(1).max(50),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb.from("telegram_settings").upsert({
      id: 1,
      bot_token: data.bot_token,
      chat_id: data.chat_id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function sendTelegram(text: string) {
  const sb = await admin();
  const { data, error } = await sb.from("telegram_settings").select("bot_token,chat_id").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.bot_token || !data?.chat_id) {
    throw new Error("Chưa cấu hình Telegram Bot Token và Chat ID");
  }
  const res = await fetch(`https://api.telegram.org/bot${data.bot_token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: data.chat_id, text, parse_mode: "HTML" }),
  });
  const body: unknown = await res.json().catch(() => null);
  const telegramResponse = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  if (!res.ok || telegramResponse?.ok === false) {
    const description = typeof telegramResponse?.description === "string" ? telegramResponse.description : res.statusText;
    throw new Error(`Telegram lỗi: ${description}`);
  }
  return { ok: true };
}

const DAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

/** Lịch học hôm nay: nhóm theo lớp, liệt kê tên học sinh + khung giờ (dựa trên schedule_slots). */
export const sendTodayScheduleTelegram = createServerFn({ method: "POST" }).handler(async () => {
  const sb = await admin();
  const today = new Date();
  const dow = today.getDay();

  const { data: students, error } = await sb.from("students").select("*").eq("status", "Đang học");
  if (error) throw new Error(error.message);

  type SlotItem = { name: string; class_type: string; start: string; end: string };
  const items: SlotItem[] = [];
  for (const s of students ?? []) {
    const slots = readScheduleSlots(s.schedule_slots);
    for (const sl of slots) if (sl.day === dow) items.push({ name: s.name, class_type: s.class_type, start: sl.start, end: sl.end });
  }
  items.sort((a, b) => a.start.localeCompare(b.start));

  const dayLabel = DAYS[dow];
  const dateLabel = today.toLocaleDateString("vi-VN");
  let text = `📅 <b>Lịch học hôm nay - ${dayLabel}, ${dateLabel}</b>\n\n`;

  if (items.length === 0) {
    text += "Hôm nay không có lịch học.";
  } else {
    const byClass = new Map<string, SlotItem[]>();
    for (const it of items) {
      const arr = byClass.get(it.class_type) ?? [];
      arr.push(it);
      byClass.set(it.class_type, arr);
    }
    for (const [cls, list] of byClass) {
      text += `🎵 <b>Lớp ${cls}</b>\n`;
      for (const it of list) text += `  • ${it.start}–${it.end}  ${it.name}\n`;
      text += `\n`;
    }
  }
  return sendTelegram(text);
});

export const sendExpiringTelegram = createServerFn({ method: "POST" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb.from("students").select("*").eq("status", "Đang học");
  if (error) throw new Error(error.message);

  const now = new Date();
  const in5 = new Date();
  in5.setDate(now.getDate() + 5);

  const soon = (data ?? []).filter((s) => {
    const end = new Date(s.end_date);
    return end >= new Date(now.toDateString()) && end <= in5;
  });

  let text = `🔔 <b>Nhắc nhở đóng học phí</b>\n\n`;
  if (soon.length === 0) {
    text += "Không có học sinh nào sắp đến hạn trong 5 ngày tới.";
  } else {
    for (const s of soon) {
      const end = new Date(s.end_date).toLocaleDateString("vi-VN");
      text += `👤 <b>${s.name}</b> - Lớp ${s.class_type}\n📆 Hết hạn: ${end}\n💰 Học phí: ${Number(s.tuition).toLocaleString("vi-VN")}đ\n\n`;
    }
  }
  return sendTelegram(text);
});

/** Điểm danh đúng giờ: liệt kê học sinh đã điểm danh 'Đi học' trong ngày. */
export const sendAttendanceReportTelegram = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ date: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const [{ data: att }, { data: students }] = await Promise.all([
      sb.from("attendance").select("*").eq("date", data.date),
      sb.from("students").select("*"),
    ]);
    const stuMap = new Map((students ?? []).map((student) => [student.id, student]));

    const dow = new Date(data.date + "T00:00:00").getDay();
    const attended = (att ?? []).filter((row) => row.status === "Đi học");
    let text = `✅ <b>Điểm danh đúng giờ - ${new Date(data.date + "T00:00:00").toLocaleDateString("vi-VN")}</b>\n\n`;
    if (attended.length === 0) {
      text += "Chưa có học sinh nào điểm danh đi học.";
    } else {
      for (const a of attended) {
        const s = stuMap.get(a.student_id);
        if (!s) continue;
        const slot = readScheduleSlots(s.schedule_slots).find((candidate) => candidate.day === dow);
        const range = slot ? `${slot.start}–${slot.end}` : "";
        text += `👤 <b>${s.name}</b> · Lớp ${s.class_type}${range ? ` · ⏰ ${range}` : ""}\n`;
      }
    }
    return sendTelegram(text);
  });

export const sendCustomTelegram = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ text: z.string().trim().min(1).max(4000) }).parse(d))
  .handler(async ({ data }) => sendTelegram(data.text));
