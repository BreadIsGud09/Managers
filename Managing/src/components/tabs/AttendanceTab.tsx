import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { classChip, EmptyState } from "@/components/ui-bits";
import {
  CLASSES,
  DAYS,
  DAYS_SHORT,
  addScheduledDays,
  coursePrefix,
  dayOfWeekOf,
  fmtDate,
  slotsPerDayMap,
  toLocalISO,
  type AttendanceStatus,
  type ClassType,
  type ScheduleSlot,
  type Student,
} from "@/lib/shared";
import { deleteAttendance, listAttendance, listAttendanceByStudent, listAttendanceRange, listStudents, setAttendance } from "@/lib/students.functions";
import { Badge } from "@/components/ui/badge";

export function AttendanceTab() {
  const [mode, setMode] = useState<"date" | "student">("date");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
          <Button size="sm" variant={mode === "date" ? "default" : "ghost"} onClick={() => setMode("date")}>Theo ngày</Button>
          <Button size="sm" variant={mode === "student" ? "default" : "ghost"} onClick={() => setMode("student")}>Theo học sinh</Button>
        </div>
      </div>
      {mode === "date" ? <ByDateView /> : <ByStudentView />}
    </div>
  );
}

function ByDateView() {

  const [date, setDate] = useState(toLocalISO(new Date()));
  const [classFilter, setClassFilter] = useState<"Tất cả" | ClassType>("Tất cả");
  const [autoMark, setAutoMark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("att-auto") === "1";
  });
  useEffect(() => {
    try { localStorage.setItem("att-auto", autoMark ? "1" : "0"); } catch { /* ignore */ }
  }, [autoMark]);

  const fetchList = useServerFn(listStudents);
  const fetchAtt = useServerFn(listAttendance);
  const setAtt = useServerFn(setAttendance);
  const qc = useQueryClient();

  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchList() as any });
  const { data: attRows = [] } = useQuery<any[]>({
    queryKey: ["attendance", date],
    queryFn: () => fetchAtt({ data: { date } }) as any,
  });

  const attMap = useMemo(() => {
    const m = new Map<string, { status: AttendanceStatus; note: string | null; makeup_date: string | null }>();
    for (const r of attRows) m.set(r.student_id, { status: r.status, note: r.note ?? null, makeup_date: r.makeup_date ?? null });
    return m;
  }, [attRows]);

  const dow = dayOfWeekOf(date);
  // Học sinh đang bảo lưu ngày này (có bản ghi "Bảo lưu" trong bảng Học sinh bảo lưu) → không hiện
  const reservedToday = useMemo(
    () => new Set(attRows.filter((r) => r.status === "Bảo lưu").map((r) => r.student_id as string)),
    [attRows],
  );
  const scheduled = useMemo(() => {
    if (dow === null) return [];
    return (students as Student[])
      .filter((s) => s.status !== "Bảo lưu" && s.status !== "Chuẩn bị")
      .filter((s) => !reservedToday.has(s.id))
      .filter((s) => (classFilter === "Tất cả" || s.class_type === classFilter))
      // Ngày điểm danh phải nằm trong kỳ học (ngày bắt đầu → ngày kết thúc thực tế)
      .filter((s) => {
        if (!s.start_date || date < s.start_date) return false;
        const actualEnd = addScheduledDays(s.end_date, s.schedule_slots ?? [], s.reserve_days ?? 0);
        return !actualEnd || date <= actualEnd;
      })
      .filter((s) => (s.schedule_slots ?? []).some((sl: ScheduleSlot) => sl.day === dow));
  }, [students, dow, classFilter, reservedToday, date]);

  const mut = useMutation({
    mutationFn: (v: { student_id: string; status: AttendanceStatus; note?: string | null; makeup_date?: string | null }) =>
      setAtt({ data: { ...v, date } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", date] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-mark: chỉ điểm danh sau khi đã tới giờ học của slot đó.
  // Trường hợp ngày trong quá khứ: điểm danh toàn bộ buổi chưa có bản ghi.
  const autoRunRef = useRef<string>("");
  useEffect(() => {
    if (!autoMark) return;
    const key = `${date}|${scheduled.map((s) => s.id).join(",")}`;
    if (autoRunRef.current === key) return;
    autoRunRef.current = key;

    const now = new Date();
    const todayISO = toLocalISO(now);
    const isPast = date < todayISO;
    const isToday = date === todayISO;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const missing = scheduled.filter((s) => {
      if (attMap.has(s.id)) return false;
      if (isPast) return true;
      if (!isToday) return false; // ngày tương lai: không tự điểm danh
      const slot = (s.schedule_slots ?? []).find((sl) => sl.day === dow);
      if (!slot) return false;
      const [sh, sm] = slot.start.split(":").map(Number);
      return nowMinutes >= sh * 60 + sm - 20; // cho phép từ 20 phút trước giờ học
    });
    if (missing.length === 0) return;
    (async () => {
      for (const s of missing) {
        try { await setAtt({ data: { student_id: s.id, date, status: "Đi học", note: null, makeup_date: null } as any }); }
        catch { /* ignore */ }
      }
      qc.invalidateQueries({ queryKey: ["attendance", date] });
      toast.success(`Đã tự động điểm danh ${missing.length} học sinh`);
    })();
  }, [autoMark, date, scheduled, attMap, setAtt, qc, dow]);

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Sổ điểm danh</CardTitle>
          <CardDescription>{DAYS[dow ?? 0]} · Chỉ hiển thị học sinh có lịch học ngày này.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BackfillButton students={students as Student[]} />
          <label className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
            <Switch checked={autoMark} onCheckedChange={setAutoMark} />
            <span className="font-medium">Tự động điểm danh</span>
          </label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[160px]" />
          <Select value={classFilter} onValueChange={(v) => setClassFilter(v as typeof classFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Tất cả">Tất cả lớp</SelectItem>
              {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

      </CardHeader>
      <CardContent>
        {scheduled.length === 0 ? (
          <EmptyState text="Ngày này không có học sinh nào có lịch học." />
        ) : (
          <div className="space-y-2">
            {scheduled.map((s) => {
              const rec = attMap.get(s.id);
              const slot = (s.schedule_slots ?? []).find((sl: ScheduleSlot) => sl.day === dow);
              const now = new Date();
              const todayISO = toLocalISO(now);
              let presentAllowed = date < todayISO;
              if (date === todayISO && slot) {
                const [sh, sm] = slot.start.split(":").map(Number);
                presentAllowed = now.getHours() * 60 + now.getMinutes() >= sh * 60 + sm - 20;
              }
              return (
                <AttendanceRow
                  key={s.id}
                  student={s}
                  slot={slot}
                  rec={rec}
                  presentAllowed={presentAllowed}
                  onChange={(status, extra) => mut.mutate({ student_id: s.id, status, ...extra })}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttendanceRow({
  student, slot, rec, onChange, presentAllowed = true,
}: {
  student: Student;
  slot?: ScheduleSlot;
  rec?: { status: AttendanceStatus; note: string | null; makeup_date: string | null };
  presentAllowed?: boolean;
  onChange: (status: AttendanceStatus, extra: { note?: string | null; makeup_date?: string | null }) => void;
}) {
  const [note, setNote] = useState(rec?.note ?? "");
  const [makeup, setMakeup] = useState(rec?.makeup_date ?? "");
  const current = rec?.status;

  const opts: { v: AttendanceStatus; cls: string }[] = [
    { v: "Đi học", cls: "bg-success text-white" },
    { v: "Nghỉ có phép", cls: "bg-warning text-white" },
    { v: "Nghỉ không phép", cls: "bg-danger text-white" },
    
  ];

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground">
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{student.name}</p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {classChip(student.class_type)}
              {slot && <span>⏰ {slot.start}–{slot.end}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {opts.map((o) => {
            const blocked = o.v === "Đi học" && !presentAllowed;
            return (
              <Button
                key={o.v}
                size="sm"
                variant={current === o.v ? "default" : "outline"}
                className={current === o.v ? o.cls : ""}
                disabled={blocked}
                title={blocked ? "Chỉ được điểm danh 'Đi học' từ 20 phút trước giờ học" : undefined}
                onClick={() => onChange(o.v, o.v === "Nghỉ có phép" ? { note, makeup_date: makeup || null } : { note: null, makeup_date: null })}
              >
                {o.v}
              </Button>
            );
          })}
        </div>
      </div>
      {current === "Nghỉ có phép" && (
        <div className="mt-3 grid gap-3 rounded-md border border-warning/40 bg-warning/5 p-3 sm:grid-cols-[1fr_180px]">
          <div className="grid gap-1">
            <Label className="text-xs">Nội dung phép</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vd: Ốm, đi du lịch..." />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Ngày học bù</Label>
            <Input type="date" value={makeup} onChange={(e) => setMakeup(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button size="sm" onClick={() => onChange("Nghỉ có phép", { note, makeup_date: makeup || null })}>
              Lưu ghi chú & học bù
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type BackfillRow = {
  key: string;
  student: Student;
  date: string;
  dow: number;
  slot: ScheduleSlot;
  selected: boolean;
  status: AttendanceStatus;
};

function BackfillButton({ students }: { students: Student[] }) {
  const [open, setOpen] = useState(false);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toLocalISO(d);
  }, []);
  const defaultFrom = useMemo(() => {
    const dates = students.map((s) => s.start_date).filter(Boolean).sort();
    if (dates.length === 0) {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return toLocalISO(d);
    }
    return dates[0];
  }, [students]);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(yesterday);
  const [scope, setScope] = useState<"Tất cả" | ClassType>("Tất cả");
  const [studentId, setStudentId] = useState<string>("all");
  const [rows, setRows] = useState<BackfillRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const fetchRange = useServerFn(listAttendanceRange);
  const setAtt = useServerFn(setAttendance);
  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(yesterday);
    }
  }, [open, defaultFrom, yesterday]);

  const filteredStudents = useMemo(() => {
    let list = students.filter((s) => s.status !== "Hoàn thành" && s.status !== "Bảo lưu" && s.status !== "Chuẩn bị");
    if (scope !== "Tất cả") list = list.filter((s) => s.class_type === scope);
    if (studentId !== "all") list = list.filter((s) => s.id === studentId);
    return list;
  }, [students, scope, studentId]);

  async function loadRows() {
    if (!from || !to || from > to) {
      toast.error("Khoảng ngày không hợp lệ");
      return;
    }
    setLoading(true);
    try {
      const existing = (await fetchRange({ data: { from, to } })) as { student_id: string; date: string }[];
      const has = new Set(existing.map((r) => `${r.student_id}|${r.date}`));
      const result: BackfillRow[] = [];
      const start = new Date(from + "T00:00:00");
      const end = new Date(to + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = toLocalISO(d);
        const dow = d.getDay();
        for (const s of filteredStudents) {
          if (iso < s.start_date || iso > s.end_date) continue;
          const slots = (s.schedule_slots ?? []).filter((sl) => sl.day === dow);
          for (const slot of slots) {
            const key = `${s.id}|${iso}|${slot.start}`;
            if (has.has(`${s.id}|${iso}`)) continue;
            result.push({ key, student: s, date: iso, dow, slot, selected: true, status: "Đi học" });
          }
        }
      }
      result.sort((a, b) => a.date.localeCompare(b.date) || a.student.name.localeCompare(b.student.name));
      setRows(result);
      if (result.length === 0) toast.info("Không có buổi nào cần bù");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const selectedCount = rows.filter((r) => r.selected).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  async function saveAll() {
    const picks = rows.filter((r) => r.selected);
    if (picks.length === 0) return;
    setSaving(true);
    setProgress(0);
    let ok = 0;
    let fail = 0;
    // gộp theo (student_id, date) — chỉ lưu 1 bản ghi/ngày (schema unique)
    const dedup = new Map<string, BackfillRow>();
    for (const r of picks) dedup.set(`${r.student.id}|${r.date}`, r);
    const list = Array.from(dedup.values());
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      try {
        await setAtt({
          data: {
            student_id: r.student.id,
            date: r.date,
            status: r.status,
            note: null,
            makeup_date: null,
          } as any,
        });
        ok++;
      } catch {
        fail++;
      }
      setProgress(i + 1);
    }
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["attendance"] });
    toast.success(`Đã lưu ${ok} buổi${fail ? `, lỗi ${fail}` : ""}`);
    setRows([]);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">Điểm danh bù</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Điểm danh bù hàng loạt</DialogTitle>
          <DialogDescription>Liệt kê các buổi học đã qua chưa điểm danh trong khoảng ngày đã chọn.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <div className="grid gap-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Lớp</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Tất cả">Tất cả lớp</SelectItem>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Học sinh</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                {students
                  .filter((s) => scope === "Tất cả" || s.class_type === scope)
                  .map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {coursePrefix(s.class_type)}{s.course_index ?? 1}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={loadRows} disabled={loading}>{loading ? "Đang tải..." : "Quét buổi thiếu"}</Button>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) => setRows((rs) => rs.map((r) => ({ ...r, selected: !!v })))}
            />
            <span>Chọn tất cả ({selectedCount}/{rows.length})</span>
            <div className="ml-auto flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => r.selected ? { ...r, status: "Đi học" } : r))}>Đặt = Đi học</Button>
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => r.selected ? { ...r, status: "Nghỉ có phép" } : r))}>Đặt = Nghỉ CP</Button>
              <Button variant="outline" size="sm" onClick={() => setRows((rs) => rs.map((r) => r.selected ? { ...r, status: "Nghỉ không phép" } : r))}>Đặt = Nghỉ KP</Button>
            </div>
          </div>
        )}

        <div className="mt-2 max-h-[400px] overflow-auto rounded-md border">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Chưa có dữ liệu. Bấm "Quét buổi thiếu" để bắt đầu.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs">
                <tr>
                  <th className="w-10 p-2"></th>
                  <th className="p-2 text-left">Ngày</th>
                  <th className="p-2 text-left">Thứ</th>
                  <th className="p-2 text-left">Học sinh</th>
                  <th className="p-2 text-left">Lớp</th>
                  <th className="p-2 text-left">Khung giờ</th>
                  <th className="p-2 text-left">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="p-2 text-center">
                      <Checkbox
                        checked={r.selected}
                        onCheckedChange={(v) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, selected: !!v } : x))}
                      />
                    </td>
                    <td className="p-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="p-2">{DAYS_SHORT[r.dow]}</td>
                    <td className="p-2">{r.student.name}</td>
                    <td className="p-2">{classChip(r.student.class_type)}</td>
                    <td className="p-2 whitespace-nowrap">{r.slot.start}–{r.slot.end}</td>
                    <td className="p-2">
                      <Select
                        value={r.status}
                        onValueChange={(v) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, status: v as AttendanceStatus } : x))}
                      >
                        <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Đi học">Đi học</SelectItem>
                          <SelectItem value="Nghỉ có phép">Nghỉ có phép</SelectItem>
                          <SelectItem value="Nghỉ không phép">Nghỉ không phép</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="mt-3">
          {saving && <span className="mr-auto text-xs text-muted-foreground">Đang lưu {progress}/{rows.filter((r) => r.selected).length}...</span>}
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Hủy</Button>
          <Button onClick={saveAll} disabled={saving || selectedCount === 0}>Lưu {selectedCount} buổi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ================== BY-STUDENT VIEW ==================

type SessionRow = {
  key: string;
  date: string;
  dow: number;
  slot: ScheduleSlot;
  slotIndex: number; // index in that day (0 or 1)
  slotsInDay: number;
  isPast: boolean;
  isToday: boolean;
  isFuture: boolean;
};




function ByStudentView() {
  const fetchList = useServerFn(listStudents);
  const fetchByStudent = useServerFn(listAttendanceByStudent);
  const setAtt = useServerFn(setAttendance);
  const delAtt = useServerFn(deleteAttendance);
  const qc = useQueryClient();

  const [classFilter, setClassFilter] = useState<"Tất cả" | ClassType>("Tất cả");
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState<string>("");

  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchList() as any });

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students as Student[])
      .filter((s) => classFilter === "Tất cả" || s.class_type === classFilter)
      .filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [students, classFilter, search]);

  useEffect(() => {
    if (!studentId && filteredStudents.length > 0) setStudentId(filteredStudents[0].id);
    if (studentId && !filteredStudents.some((s) => s.id === studentId) && filteredStudents.length > 0) {
      setStudentId(filteredStudents[0].id);
    }
  }, [filteredStudents, studentId]);

  const student = useMemo(() => (students as Student[]).find((s) => s.id === studentId), [students, studentId]);

  const { data: attRows = [], isLoading } = useQuery<any[]>({
    queryKey: ["attendance-by-student", studentId],
    queryFn: () => fetchByStudent({ data: { student_id: studentId } }) as any,
    enabled: !!studentId,
  });

  const attMap = useMemo(() => {
    const m = new Map<string, { status: AttendanceStatus; note: string | null; makeup_date: string | null }>();
    for (const r of attRows) m.set(r.date, { status: r.status, note: r.note ?? null, makeup_date: r.makeup_date ?? null });
    return m;
  }, [attRows]);

  const sessions = useMemo<SessionRow[]>(() => {
    if (!student) return [];
    const slots = (student.schedule_slots ?? []) as ScheduleSlot[];
    if (slots.length === 0 || !student.start_date || !student.end_date) return [];
    const actualEnd = addScheduledDays(student.end_date, slots, student.reserve_days ?? 0);
    const perDay = slotsPerDayMap(slots);
    const todayISO = toLocalISO(new Date());
    const rows: SessionRow[] = [];
    const cursor = new Date(student.start_date + "T00:00:00");
    const end = new Date(actualEnd + "T00:00:00");
    let safety = 0;
    while (cursor <= end && safety < 365 * 6) {
      safety++;
      const iso = toLocalISO(cursor);
      const dow = cursor.getDay();
      const daySlots = slots.filter((sl) => sl.day === dow).sort((a, b) => a.start.localeCompare(b.start));
      const count = perDay.get(dow) ?? 0;
      if (daySlots.length > 0 && count > 0) {
        daySlots.forEach((slot, idx) => {
          rows.push({
            key: `${iso}|${idx}`,
            date: iso,
            dow,
            slot,
            slotIndex: idx,
            slotsInDay: daySlots.length,
            isPast: iso < todayISO,
            isToday: iso === todayISO,
            isFuture: iso > todayISO,
          });
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  }, [student]);

  const summary = useMemo(() => {
    const s = { present: 0, excused: 0, absent: 0, reserved: 0, blank: 0 };
    // 1 attendance record covers 1 date (all slots of that day merge)
    const dateSeen = new Map<string, AttendanceStatus | "">();
    for (const r of sessions) {
      if (dateSeen.has(r.date)) continue;
      const rec = attMap.get(r.date);
      dateSeen.set(r.date, rec?.status ?? "");
    }
    // count per session (weighted by slotsInDay so total matches "Tổng buổi")
    const sessionsPerDate = new Map<string, number>();
    for (const r of sessions) sessionsPerDate.set(r.date, (sessionsPerDate.get(r.date) ?? 0) + 1);
    for (const [date, status] of dateSeen) {
      const n = sessionsPerDate.get(date) ?? 1;
      if (status === "Đi học") s.present += n;
      else if (status === "Nghỉ có phép") s.excused += n;
      else if (status === "Nghỉ không phép") s.absent += n;
      else if (status === "Bảo lưu") s.reserved += n;
      else s.blank += n;
    }
    return s;
  }, [sessions, attMap]);

  const setMut = useMutation({
    mutationFn: (v: { date: string; status: AttendanceStatus; note?: string | null; makeup_date?: string | null }) =>
      setAtt({ data: { student_id: studentId, ...v } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance-by-student", studentId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (date: string) => delAtt({ data: { student_id: studentId, date } as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance-by-student", studentId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Điểm danh theo học sinh</CardTitle>
          <CardDescription>Toàn bộ buổi trong khóa — sửa trạng thái/ghi chú trực tiếp.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={classFilter} onValueChange={(v) => setClassFilter(v as typeof classFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Tất cả">Tất cả lớp</SelectItem>
              {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Tìm học sinh..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-[180px]" />
          <Select value={studentId} onValueChange={setStudentId}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Chọn học sinh" /></SelectTrigger>
            <SelectContent>
              {filteredStudents.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {coursePrefix(s.class_type)}{s.course_index}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {!student ? (
          <EmptyState text="Chọn một học sinh để xem." />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_auto]">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{student.name}</span>
                {classChip(student.class_type)}
                <Badge variant="outline">Khóa {coursePrefix(student.class_type)}{student.course_index}</Badge>
                <span className="text-muted-foreground">
                  {fmtDate(student.start_date)} → {fmtDate(addScheduledDays(student.end_date, student.schedule_slots ?? [], student.reserve_days ?? 0))}
                </span>
                <span className="text-muted-foreground">· Tổng: {student.total_sessions} buổi</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge className="bg-success text-white">Đi học: {summary.present}</Badge>
                <Badge className="bg-warning text-white">Nghỉ CP: {summary.excused}</Badge>
                <Badge className="bg-danger text-white">Nghỉ KP: {summary.absent}</Badge>
                <Badge className="bg-primary text-primary-foreground">Bảo lưu: {summary.reserved}</Badge>
                <Badge variant="outline">Chưa ĐD: {summary.blank}</Badge>
                <Badge variant="secondary">Σ {sessions.length}</Badge>
              </div>
            </div>

            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Đang tải...</div>
            ) : sessions.length === 0 ? (
              <EmptyState text="Học sinh chưa có lịch học hợp lệ." />
            ) : (
              <div className="max-h-[560px] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/70 text-xs">
                    <tr>
                      <th className="w-12 p-2 text-left">#</th>
                      <th className="p-2 text-left">Ngày</th>
                      <th className="p-2 text-left">Thứ</th>
                      <th className="p-2 text-left">Khung giờ</th>
                      <th className="p-2 text-left">Trạng thái</th>
                      <th className="p-2 text-left">Ghi chú</th>
                      <th className="p-2 text-left">Học bù</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((r, i) => {
                      const rec = attMap.get(r.date);
                      const status: AttendanceStatus | "" = rec?.status ?? "";
                      return (
                        <tr
                          key={r.key}
                          className={[
                            "border-t",
                            r.isFuture ? "opacity-50" : "",
                            r.isToday ? "bg-primary/5" : "",
                          ].join(" ")}
                        >
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="p-2">{DAYS_SHORT[r.dow]}</td>
                          <td className="p-2 whitespace-nowrap">{r.slot.start}–{r.slot.end}</td>
                          <td className="p-2">
                            <Select
                              value={status || "__blank__"}
                              onValueChange={(v) => {
                                if (v === "__blank__") delMut.mutate(r.date);
                                else setMut.mutate({
                                  date: r.date,
                                  status: v as AttendanceStatus,
                                  note: rec?.note ?? null,
                                  makeup_date: rec?.makeup_date ?? null,
                                });
                              }}
                            >
                              <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__blank__">Chưa điểm danh</SelectItem>
                                <SelectItem value="Đi học">Đi học</SelectItem>
                                <SelectItem value="Nghỉ có phép">Nghỉ có phép</SelectItem>
                                <SelectItem value="Nghỉ không phép">Nghỉ không phép</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Input
                              className="h-8"
                              placeholder="—"
                              defaultValue={rec?.note ?? ""}
                              disabled={!status}
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (!status) return;
                                if ((rec?.note ?? "") === v) return;
                                setMut.mutate({
                                  date: r.date,
                                  status: status as AttendanceStatus,
                                  note: v || null,
                                  makeup_date: rec?.makeup_date ?? null,
                                });
                              }}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="date"
                              className="h-8 w-[150px]"
                              defaultValue={rec?.makeup_date ?? ""}
                              disabled={status !== "Nghỉ có phép"}
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (status !== "Nghỉ có phép") return;
                                if ((rec?.makeup_date ?? "") === v) return;
                                setMut.mutate({
                                  date: r.date,
                                  status: "Nghỉ có phép",
                                  note: rec?.note ?? null,
                                  makeup_date: v || null,
                                });
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


