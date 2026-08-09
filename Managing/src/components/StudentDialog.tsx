import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  CLASSES,
  DAYS,
  DAYS_ORDER,
  computeEndDate,
  dayOfWeekOf,
  defaultSessionsFor,
  defaultTuitionFor,
  fmtDate,
  formatMoney,
  parseMoney,
  toLocalISO,
  weeklySessions,
  type ClassType,
  type ScheduleSlot,
  type Student,

} from "@/lib/shared";
import { upsertStudent } from "@/lib/students.functions";

type FormState = Omit<Student, "id" | "schedule_days" | "sessions_per_day"> & { id?: string };

export function StudentDialog({ student, trigger }: { student?: Student; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const upsert = useServerFn(upsertStudent);

  const mut = useMutation({
    mutationFn: (v: FormState) => upsert({ data: v } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success(student ? "Đã cập nhật học sinh" : "Đã thêm học sinh");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [form, setForm] = useState<FormState>(() => {
    const cls = student?.class_type ?? "Piano";
    return {
      id: student?.id,
      name: student?.name ?? "",
      age: student?.age ?? 8,
      class_type: cls,
      tuition: student?.tuition ?? defaultTuitionFor(cls),
      start_date: student?.start_date ?? toLocalISO(new Date()),
      end_date: student?.end_date ?? toLocalISO(new Date(Date.now() + 30 * 86400000)),
      status: student?.status ?? "Đang học",
      reserve_days: student?.reserve_days ?? 0,
      total_sessions: student?.total_sessions ?? defaultSessionsFor(cls),
      schedule_slots: (student?.schedule_slots as ScheduleSlot[]) ?? [],
      course_index: student?.course_index ?? 1,
    };
  });

  const [tuitionStr, setTuitionStr] = useState<string>(() => formatMoney(form.tuition));

  const autoEnd = useMemo(
    () => computeEndDate(form.start_date, form.schedule_slots, form.total_sessions),
    [form.start_date, form.schedule_slots, form.total_sessions],
  );
  const perWeek = weeklySessions(form.schedule_slots);

  const setSlotField = (idx: number, patch: Partial<ScheduleSlot>) => {
    setForm((f) => {
      const arr = f.schedule_slots.slice();
      arr[idx] = { ...arr[idx], ...patch };
      return { ...f, schedule_slots: arr };
    });
  };
  const addSlot = () => setForm((f) => ({ ...f, schedule_slots: [...f.schedule_slots, { day: 1, start: "16:00", end: "17:00" }] }));
  const removeSlot = (idx: number) => setForm((f) => ({ ...f, schedule_slots: f.schedule_slots.filter((_, i) => i !== idx) }));

  const startDow = dayOfWeekOf(form.start_date);
  const endDow = dayOfWeekOf(form.end_date);
  const slotDays = new Set(form.schedule_slots.map((s) => s.day));
  const startInvalid = startDow !== null && slotDays.size > 0 && !slotDays.has(startDow);
  const endInvalid = endDow !== null && slotDays.size > 0 && !slotDays.has(endDow);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{student ? "Sửa học sinh" : "Thêm học sinh mới"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Tên học sinh</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Tuổi</Label>
              <Input type="number" min={1} max={120} value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label>Lớp học</Label>
              <Select value={form.class_type} onValueChange={(v) => {
                const cls = v as ClassType;
                const newTuition = defaultTuitionFor(cls);
                setForm((f) => ({ ...f, class_type: cls, total_sessions: defaultSessionsFor(cls), tuition: newTuition }));
                setTuitionStr(formatMoney(newTuition));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Học phí/khóa (VNĐ)</Label>
              <Input
                inputMode="numeric"
                value={tuitionStr}
                onChange={(e) => {
                  const n = parseMoney(e.target.value);
                  setTuitionStr(formatMoney(n));
                  setForm((f) => ({ ...f, tuition: n }));
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Tổng số buổi/khóa</Label>
              <Input type="number" min={1} value={form.total_sessions} onChange={(e) => setForm({ ...form, total_sessions: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground">Piano 48, Múa/Vẽ 24 (mặc định). 1 buổi = 1 giờ.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Tên khóa</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-primary">K</span>
                <Input type="number" min={1} value={form.course_index} onChange={(e) => setForm({ ...form, course_index: Math.max(1, Number(e.target.value) || 1) })} className="w-24" />
                <span className="text-xs text-muted-foreground">Học sinh mới = K1, khóa tiếp theo tăng dần</span>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Khung giờ học ({perWeek} buổi/tuần)</Label>
              <Button type="button" size="sm" variant="outline" onClick={addSlot}>
                <Plus className="mr-1 h-4 w-4" />Thêm khung giờ
              </Button>
            </div>
            {form.schedule_slots.length === 0 && (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Chưa có khung giờ. Bấm "Thêm khung giờ" để thiết lập lịch (tối thiểu 2 buổi/tuần; 1 khung 2 giờ = 2 buổi).
              </p>
            )}
            <div className="space-y-2">
              {form.schedule_slots.map((sl, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2 rounded-md border bg-muted/30 p-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Thứ</Label>
                    <Select value={String(sl.day)} onValueChange={(v) => setSlotField(idx, { day: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{DAYS_ORDER.map((d) => <SelectItem key={d} value={String(d)}>{DAYS[d]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Bắt đầu</Label>
                    <Input type="time" step={900} value={sl.start} onChange={(e) => setSlotField(idx, { start: e.target.value })} className="w-[110px]" />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Kết thúc</Label>
                    <Input type="time" step={900} value={sl.end} onChange={(e) => setSlotField(idx, { end: e.target.value })} className="w-[110px]" />
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => removeSlot(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {perWeek > 0 && perWeek < 2 && <p className="text-xs text-destructive">Học sinh phải học tối thiểu 2 buổi/tuần.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Ngày bắt đầu</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={startInvalid ? "border-destructive" : ""} />
              {startInvalid && <p className="text-xs text-destructive">Không trùng lịch học. Lịch: {Array.from(slotDays).sort().map((d) => DAYS[d]).join(", ")}.</p>}
            </div>
            <div className="grid gap-2">
              <Label>Ngày kết thúc</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={endInvalid ? "border-destructive" : ""} />
              {endInvalid && <p className="text-xs text-destructive">Không trùng lịch học.</p>}
              {autoEnd && autoEnd !== form.end_date && (
                <button type="button" className="text-left text-xs text-primary hover:underline"
                  onClick={() => setForm((f) => ({ ...f, end_date: autoEnd }))}>
                  Dùng ngày tính tự động: {fmtDate(autoEnd)}
                </button>
              )}
            </div>
          </div>

        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button
            onClick={() => {
              if (!form.name.trim()) return toast.error("Vui lòng nhập tên học sinh");
              if (perWeek < 2) return toast.error("Học sinh phải học tối thiểu 2 buổi/tuần");
              for (const s of form.schedule_slots) if (s.start >= s.end) return toast.error("Khung giờ không hợp lệ");
              const finalEnd = autoEnd && !form.end_date ? autoEnd : form.end_date;
              if (startInvalid) return toast.error("Ngày bắt đầu không trùng lịch học");
              const eDow = dayOfWeekOf(finalEnd);
              if (eDow === null || !slotDays.has(eDow)) return toast.error("Ngày kết thúc không trùng lịch học");
              mut.mutate({ ...form, end_date: finalEnd });
            }}
            disabled={mut.isPending}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
