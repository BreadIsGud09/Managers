export type ClassType = "Piano" | "Múa" | "Vẽ";
export type StudentStatus = "Đang học" | "Bảo lưu" | "Hoàn thành" | "Chuẩn bị";
export type AttendanceStatus = "Đi học" | "Nghỉ có phép" | "Nghỉ không phép" | "Bảo lưu";

export const STUDENT_STATUSES: StudentStatus[] = ["Đang học", "Chuẩn bị", "Bảo lưu", "Hoàn thành"];

/** Trạng thái hiển thị: hết buổi trong khóa → Hoàn thành */
export function effectiveStatus(status: StudentStatus, remain: number): StudentStatus {
  if (status === "Đang học" && remain <= 0) return "Hoàn thành";
  return status;
}

/** Ngày học kế tiếp (theo lịch học) sau ngày cho trước */
export function nextScheduledDate(afterISO: string, slots: ScheduleSlot[]): string {
  if (!afterISO || slots.length === 0) return afterISO;
  const days = new Set(slots.map((s) => s.day));
  const cursor = new Date(afterISO + "T00:00:00");
  if (isNaN(cursor.getTime())) return afterISO;
  for (let i = 0; i < 60; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (days.has(cursor.getDay())) return toLocalISO(cursor);
  }
  return afterISO;
}

export function coursePrefix(c: ClassType): "P" | "M" | "V" {
  return c === "Piano" ? "P" : c === "Múa" ? "M" : "V";
}


/** Cộng thêm N buổi (theo lịch học) vào ngày end_date để lấy ngày kết thúc thực tế */
export function addScheduledDays(endISO: string, slots: ScheduleSlot[], extraSessions: number): string {
  if (!endISO || extraSessions <= 0 || slots.length === 0) return endISO;
  const perDay = slotsPerDayMap(slots);
  const cursor = new Date(endISO + "T00:00:00");
  if (isNaN(cursor.getTime())) return endISO;
  let remain = extraSessions;
  for (let i = 0; i < 365 * 4 && remain > 0; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const inc = perDay.get(cursor.getDay()) ?? 0;
    if (inc > 0) remain -= inc;
  }
  return toLocalISO(cursor);
}

export interface ScheduleSlot {
  day: number; // 0..6 (0=CN)
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface Student {
  id: string;
  name: string;
  age: number;
  class_type: ClassType;
  tuition: number;
  start_date: string;
  end_date: string;
  status: StudentStatus;
  reserve_days: number;
  total_sessions: number;
  schedule_days: number[];
  sessions_per_day: 1 | 2;
  schedule_slots: ScheduleSlot[];
  course_index: number;
  person_id?: string | null;
}

export interface AttendanceRow {
  id: string;
  student_id: string;
  date: string;
  status: AttendanceStatus;
  note: string | null;
  makeup_date: string | null;
  created_at: string;
}

export interface TuitionPayment {
  id: string;
  student_id: string;
  month: string; // YYYY-MM-01
  amount: number;
  paid_date: string;
  ky_index: number;
  note: string | null;
}

export const CLASSES: ClassType[] = ["Piano", "Múa", "Vẽ"];
export const DAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
export const DAYS_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function defaultSessionsFor(c: ClassType) {
  return c === "Piano" ? 48 : 24;
}

export function defaultTuitionFor(c: ClassType) {
  return c === "Piano" ? 12000000 : 3800000;
}

export function formatMoney(n: number) {
  if (!Number.isFinite(n)) return "";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function parseMoney(s: string): number {
  const digits = (s || "").replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

export function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("vi-VN");
}

export function dayOfWeekOf(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? null : d.getDay();
}

/** Số buổi (1 buổi = 1 giờ) trong 1 slot, tối thiểu 1 */
export function slotSessions(sl: ScheduleSlot): number {
  const [sh, sm] = sl.start.split(":").map(Number);
  const [eh, em] = sl.end.split(":").map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(1, Math.round(mins / 60));
}

/** Tổng số buổi mỗi thứ (0..6) trong slots, tính theo giờ */
export function slotsPerDayMap(slots: ScheduleSlot[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of slots) m.set(s.day, (m.get(s.day) ?? 0) + slotSessions(s));
  return m;
}

export function uniqueDays(slots: ScheduleSlot[]): number[] {
  return Array.from(new Set(slots.map((s) => s.day))).sort((a, b) => a - b);
}

export function maxPerDay(slots: ScheduleSlot[]): 1 | 2 {
  let mx = 1;
  const m = slotsPerDayMap(slots);
  for (const v of m.values()) if (v > mx) mx = v;
  return (mx >= 2 ? 2 : 1) as 1 | 2;
}

/** Tổng buổi/tuần từ slots (1 buổi = 1 giờ) */
export function weeklySessions(slots: ScheduleSlot[]): number {
  return slots.reduce((acc, s) => acc + slotSessions(s), 0);
}

/** Tính ngày kết thúc dựa trên schedule_slots + total_sessions */
export function computeEndDate(startISO: string, slots: ScheduleSlot[], total: number): string | null {
  if (!startISO || slots.length === 0 || total < 1) return null;
  const perDay = slotsPerDayMap(slots);
  const start = new Date(startISO + "T00:00:00");
  if (isNaN(start.getTime())) return null;
  let count = 0;
  const cursor = new Date(start);
  for (let i = 0; i < 365 * 6; i++) {
    const dow = cursor.getDay();
    const inc = perDay.get(dow) ?? 0;
    if (inc > 0) {
      count += inc;
      if (count >= total) return toLocalISO(cursor);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

/** Ngày đầu tuần (Thứ 2) của tuần chứa d */
export function startOfWeek(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  const dow = c.getDay(); // 0=CN
  const diff = dow === 0 ? -6 : 1 - dow;
  c.setDate(c.getDate() + diff);
  return c;
}

export function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7) + "-01";
}

export function fmtMonth(monthISO: string) {
  const d = new Date(monthISO + "T00:00:00");
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function classChipStyles(c: ClassType) {
  return {
    Piano: "bg-piano text-piano-foreground",
    "Múa": "bg-mua text-mua-foreground",
    "Vẽ": "bg-ve text-ve-foreground",
  }[c];
}

/** Kiểm tra hs có bảo lưu vào ngày date không (tạm hiểu: status=Bảo lưu & date < end_date - reserve_days? — đơn giản hoá: nếu status=Bảo lưu thì mờ) */
export function isReservedOn(_dateISO: string, status: StudentStatus): boolean {
  return status === "Bảo lưu";
}

/** ===== Hồ sơ học sinh (một bé — nhiều khóa/nhiều lớp) ===== */
export interface Person {
  id: string;
  name: string;
  age: number;
  note: string | null;
}

/** Khóa nhận diện một học sinh (ưu tiên person_id, fallback tên + tuổi) */
export function personKey(s: { person_id?: string | null; name: string; age: number }): string {
  return s.person_id || `${s.name.trim().toLowerCase()}|${s.age}`;
}

export interface PersonGroup {
  key: string;
  name: string;
  age: number;
  courses: Student[];
}

/** Gộp danh sách khóa học thành danh sách học sinh duy nhất */
export function groupByPerson(students: Student[]): PersonGroup[] {
  const m = new Map<string, PersonGroup>();
  for (const s of students) {
    const k = personKey(s);
    if (!m.has(k)) m.set(k, { key: k, name: s.name, age: s.age, courses: [] });
    m.get(k)!.courses.push(s);
  }
  const out = Array.from(m.values());
  for (const g of out) g.courses.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  return out.sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

/** ===== Lịch sử đổi lịch học ===== */
export interface ScheduleChange {
  id: string;
  student_id: string;
  effective_from: string;
  old_slots: ScheduleSlot[];
  new_slots: ScheduleSlot[];
  reason: string | null;
  created_at: string;
}

/** Lịch học có hiệu lực của một khóa tại ngày cho trước */
export function slotsEffectiveOn(
  student: Student,
  changes: ScheduleChange[],
  dateISO: string,
): ScheduleSlot[] {
  const list = changes
    .filter((c) => c.student_id === student.id)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  if (list.length === 0) return (student.schedule_slots ?? []) as ScheduleSlot[];
  const upcoming = list.find((c) => c.effective_from > dateISO);
  if (upcoming) return (upcoming.old_slots ?? []) as ScheduleSlot[];
  return (student.schedule_slots ?? []) as ScheduleSlot[];
}

export function describeSlots(slots: ScheduleSlot[]): string {
  if (!slots || slots.length === 0) return "—";
  return slots
    .slice()
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
    .map((s) => `${DAYS_SHORT[s.day]} ${s.start}-${s.end}`)
    .join(", ");
}
