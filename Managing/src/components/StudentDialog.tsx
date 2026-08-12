import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { IsValidPhoneNumber } from "@/Shared/Constraints";
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
  type EditableStudentStatus,
  type ParentInformation,
  type ScheduleSlot,
  type Student,
} from "@/Shared/shared";
import { upsertStudent } from "@/server-functions/enrollment.functions";

type FormState = Omit<Student, "id" | "schedule_days" | "sessions_per_day" | "status"> & {
  id?: string;
  status: EditableStudentStatus;
};

function editableStatus(status: Student["status"] | undefined): EditableStudentStatus {
  if (status === "Nghỉ phép") return "Bảo lưu";
  if (status === "Kết thúc") return "Hoàn thành";
  return status ?? "Đang học";
}

// Keep user-facing wording in the dialog; the shared rule only returns true/false.
function showInvalidPhoneWarning() {
  toast.error("Số điện thoại phụ huynh không hợp lệ", {
    id: "invalid-parent-phone",
    description: "Vui lòng kiểm tra lại, ví dụ: 0901234567 hoặc +84901234567.",
  });
}

// Blocks tab navigation and saving before invalid parent data reaches the server.
function validateParentForDisplay(parent: ParentInformation): boolean {
  if (!parent.first_name.trim()) {
    toast.error("Vui lòng nhập họ phụ huynh");
    return false;
  }
  if (!parent.last_name.trim()) {
    toast.error("Vui lòng nhập tên phụ huynh");
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email.trim())) {
    toast.error("Email phụ huynh không hợp lệ");
    return false;
  }
  if (!IsValidPhoneNumber(parent.phone_number.trim())) {
    showInvalidPhoneWarning();
    return false;
  }
  return true;
}

export function StudentDialog({
  student,
  trigger,
}: {
  student?: Student;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"parent" | "student">("parent");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const qc = useQueryClient();
  const upsert = useServerFn(upsertStudent);

  const mut = useMutation({
    // Keep `name` as a derived display field while persisting both DB name columns.
    mutationFn: (formState: FormState) =>
      upsert({
        data: {
          ...formState,
          name: `${formState.first_name.trim()} ${formState.last_name.trim()}`.trim(),
        },
      }),
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
      first_name: student?.first_name ?? student?.name ?? "",
      last_name: student?.last_name ?? "",
      name: student?.name ?? "",
      aka: student?.aka ?? null,
      note: student?.note ?? null,
      age: student?.age ?? 8,
      class_type: cls,
      tuition: student?.tuition ?? defaultTuitionFor(cls),
      start_date: student?.start_date ?? toLocalISO(new Date()),
      end_date: student?.end_date ?? toLocalISO(new Date(Date.now() + 30 * 86400000)),
      status: editableStatus(student?.status),
      reserve_days: student?.reserve_days ?? 0,
      total_sessions: student?.total_sessions ?? defaultSessionsFor(cls),
      schedule_slots: (student?.schedule_slots as ScheduleSlot[]) ?? [],
      course_index: student?.course_index ?? 1,
      person_id: student?.person_id ?? null,
      parent: student?.parent ?? {
        id: null,
        first_name: "",
        last_name: "",
        email: "",
        phone_number: "",
      },
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
  const addSlot = () =>
    setForm((f) => ({
      ...f,
      schedule_slots: [...f.schedule_slots, { day: 1, start: "16:00", end: "17:00" }],
    }));
  const removeSlot = (idx: number) =>
    setForm((f) => ({ ...f, schedule_slots: f.schedule_slots.filter((_, i) => i !== idx) }));

  const startDow = dayOfWeekOf(form.start_date);
  const endDow = dayOfWeekOf(form.end_date);
  const slotDays = new Set(form.schedule_slots.map((s) => s.day));
  const startInvalid = startDow !== null && slotDays.size > 0 && !slotDays.has(startDow);
  const endInvalid = endDow !== null && slotDays.size > 0 && !slotDays.has(endDow);
  // Delay inline errors until the user interacts with the phone field.
  const phoneInvalid =
    phoneTouched &&
    form.parent.phone_number.trim().length > 0 &&
    !IsValidPhoneNumber(form.parent.phone_number.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setActiveTab("parent");
          setPhoneTouched(false);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{student ? "Sửa học sinh" : "Thêm học sinh mới"}</DialogTitle>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "parent" | "student")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="parent">1. Thông tin phụ huynh</TabsTrigger>
            <TabsTrigger value="student">2. Thông tin học sinh</TabsTrigger>
          </TabsList>

          <TabsContent value="parent" className="mt-4 grid gap-4">
            <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Thông tin phụ huynh là bắt buộc để tạo hồ sơ học sinh.
            </p>
            {/* Project convention: Họ -> first_name, Tên -> last_name. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>
                  Họ phụ huynh <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.parent.first_name}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      parent: { ...current.parent, first_name: e.target.value },
                    }))
                  }
                  placeholder="Nguyễn"
                  autoComplete="family-name"
                />
              </div>
              <div className="grid gap-2">
                <Label>
                  Tên phụ huynh <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.parent.last_name}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      parent: { ...current.parent, last_name: e.target.value },
                    }))
                  }
                  placeholder="Văn An"
                  autoComplete="given-name"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                type="email"
                value={form.parent.email}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    parent: { ...current.parent, email: e.target.value },
                  }))
                }
                placeholder="phuhuynh@example.com"
                autoComplete="email"
              />
            </div>
            <div className="grid gap-2">
              <Label>
                Số điện thoại <span className="text-destructive">*</span>
              </Label>
              <Input
                type="tel"
                value={form.parent.phone_number}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    parent: { ...current.parent, phone_number: e.target.value },
                  }))
                }
                onBlur={() => {
                  setPhoneTouched(true);
                  if (
                    form.parent.phone_number.trim() &&
                    !IsValidPhoneNumber(form.parent.phone_number.trim())
                  ) {
                    showInvalidPhoneWarning();
                  }
                }}
                placeholder="0901234567"
                autoComplete="tel"
                aria-invalid={phoneInvalid}
                className={phoneInvalid ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {phoneInvalid && (
                <p className="text-xs text-destructive">
                  Kiểm tra lại số điện thoại Việt Nam, không nhập khoảng trắng.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="student" className="mt-4">
            <div className="grid gap-4">
              {/* Student identity fields map directly to public.students columns. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>
                    Họ <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    placeholder="Nguyễn"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>
                    Tên học <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    placeholder="Hữu An"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Tên gọi ở nhà</Label>
                <Input
                  value={form.aka ?? ""}
                  onChange={(e) => setForm({ ...form, aka: e.target.value || null })}
                  placeholder="Không bắt buộc"
                  maxLength={80}
                />
              </div>
              <div className="grid gap-2">
                <Label>Ghi chú</Label>
                <Textarea
                  value={form.note ?? ""}
                  onChange={(e) => setForm({ ...form, note: e.target.value || null })}
                  placeholder="Thông tin cần lưu ý về học sinh (không bắt buộc)"
                  maxLength={500}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Tuổi</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Lớp học</Label>
                  <Select
                    value={form.class_type}
                    onValueChange={(v) => {
                      const cls = v as ClassType;
                      const newTuition = defaultTuitionFor(cls);
                      setForm((f) => ({
                        ...f,
                        class_type: cls,
                        total_sessions: defaultSessionsFor(cls),
                        tuition: newTuition,
                      }));
                      setTuitionStr(formatMoney(newTuition));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
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
                  <Input
                    type="number"
                    min={1}
                    value={form.total_sessions}
                    onChange={(e) => setForm({ ...form, total_sessions: Number(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Piano 48, Múa/Vẽ 24 (mặc định). 1 buổi = 1 giờ.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Tên khóa</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary">K</span>
                    <Input
                      type="number"
                      min={1}
                      value={form.course_index}
                      onChange={(e) =>
                        setForm({ ...form, course_index: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-24"
                    />
                    <span className="text-xs text-muted-foreground">
                      Học sinh mới = K1, khóa tiếp theo tăng dần
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Khung giờ học ({perWeek} buổi/tuần)</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addSlot}>
                    <Plus className="mr-1 h-4 w-4" />
                    Thêm khung giờ
                  </Button>
                </div>
                {form.schedule_slots.length === 0 && (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Chưa có khung giờ. Bấm "Thêm khung giờ" để thiết lập lịch (tối thiểu 2
                    buổi/tuần; 1 khung 2 giờ = 2 buổi).
                  </p>
                )}
                <div className="space-y-2">
                  {form.schedule_slots.map((sl, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2 rounded-md border bg-muted/30 p-2"
                    >
                      <div className="grid gap-1">
                        <Label className="text-xs">Thứ</Label>
                        <Select
                          value={String(sl.day)}
                          onValueChange={(v) => setSlotField(idx, { day: Number(v) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAYS_ORDER.map((d) => (
                              <SelectItem key={d} value={String(d)}>
                                {DAYS[d]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Bắt đầu</Label>
                        <Input
                          type="time"
                          step={900}
                          value={sl.start}
                          onChange={(e) => setSlotField(idx, { start: e.target.value })}
                          className="w-[110px]"
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Kết thúc</Label>
                        <Input
                          type="time"
                          step={900}
                          value={sl.end}
                          onChange={(e) => setSlotField(idx, { end: e.target.value })}
                          className="w-[110px]"
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => removeSlot(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                {perWeek > 0 && perWeek < 2 && (
                  <p className="text-xs text-destructive">
                    Học sinh phải học tối thiểu 2 buổi/tuần.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Ngày bắt đầu</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className={startInvalid ? "border-destructive" : ""}
                  />
                  {startInvalid && (
                    <p className="text-xs text-destructive">
                      Không trùng lịch học. Lịch:{" "}
                      {Array.from(slotDays)
                        .sort()
                        .map((d) => DAYS[d])
                        .join(", ")}
                      .
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>Ngày kết thúc</Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className={endInvalid ? "border-destructive" : ""}
                  />
                  {endInvalid && <p className="text-xs text-destructive">Không trùng lịch học.</p>}
                  {autoEnd && autoEnd !== form.end_date && (
                    <button
                      type="button"
                      className="text-left text-xs text-primary hover:underline"
                      onClick={() => setForm((f) => ({ ...f, end_date: autoEnd }))}
                    >
                      Dùng ngày tính tự động: {fmtDate(autoEnd)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          {activeTab === "parent" ? (
            <Button
              onClick={() => {
                setPhoneTouched(true);
                if (!validateParentForDisplay(form.parent)) return;
                setActiveTab("student");
              }}
            >
              Tiếp tục
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setActiveTab("parent")}>
                Quay lại
              </Button>
              <Button
                onClick={() => {
                  setPhoneTouched(true);
                  if (!validateParentForDisplay(form.parent)) {
                    setActiveTab("parent");
                    return;
                  }
                  if (!form.first_name.trim()) return toast.error("Vui lòng nhập họ học sinh");
                  if (!form.last_name.trim()) return toast.error("Vui lòng nhập tên học sinh");
                  if (perWeek < 2) return toast.error("Học sinh phải học tối thiểu 2 buổi/tuần");
                  for (const s of form.schedule_slots)
                    if (s.start >= s.end) return toast.error("Khung giờ không hợp lệ");
                  const finalEnd = autoEnd && !form.end_date ? autoEnd : form.end_date;
                  if (startInvalid) return toast.error("Ngày bắt đầu không trùng lịch học");
                  const eDow = dayOfWeekOf(finalEnd);
                  if (eDow === null || !slotDays.has(eDow))
                    return toast.error("Ngày kết thúc không trùng lịch học");
                  mut.mutate({ ...form, end_date: finalEnd });
                }}
                disabled={mut.isPending}
              >
                {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Lưu
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
