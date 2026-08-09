import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Search, Wallet, Download } from "lucide-react";
import { exportXlsx } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classChip, EmptyState } from "@/components/ui-bits";
import {
  CLASSES,
  DAYS,
  DAYS_ORDER,
  addScheduledDays,
  computeEndDate,
  coursePrefix,
  dayOfWeekOf,
  defaultSessionsFor,
  defaultTuitionFor,
  fmtDate,
  fmtMonth,
  formatMoney,
  monthKey,
  nextScheduledDate,
  parseMoney,
  toLocalISO,
  weeklySessions,
  type ClassType,
  type ScheduleSlot,
  type Student,
  type TuitionPayment,
  groupByPerson,
} from "@/lib/shared";
import { listStudents, upsertStudent } from "@/lib/students.functions";
import { deletePayment, listPayments, upsertPayment } from "@/lib/tuition.functions";

export function TuitionTab() {
  const fetchList = useServerFn(listStudents);
  const fetchPay = useServerFn(listPayments);
  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchList() as any });
  const { data: payments = [] } = useQuery<TuitionPayment[]>({ queryKey: ["payments"], queryFn: () => fetchPay() as any });

  const now = new Date();
  const [month, setMonth] = useState<string>(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [cls, setCls] = useState<"Tất cả" | ClassType>("Tất cả");
  const [search, setSearch] = useState("");

  const stuMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  const monthISO = month + "-01";
  const inMonth = useMemo(() => payments.filter((p) => p.month.slice(0, 7) === month), [payments, month]);

  const filtered = useMemo(() => {
    return inMonth.filter((p) => {
      const s = stuMap.get(p.student_id);
      if (!s) return false;
      if (cls !== "Tất cả" && s.class_type !== cls) return false;
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [inMonth, stuMap, cls, search]);

  const stats = useMemo(() => {
    const inClassScope = cls === "Tất cả" ? inMonth : inMonth.filter((p) => stuMap.get(p.student_id)?.class_type === cls);
    const total = inClassScope.reduce((a, b) => a + Number(b.amount), 0);
    const byClass: Record<ClassType, number> = { Piano: 0, "Múa": 0, "Vẽ": 0 };
    for (const p of inMonth) {
      const s = stuMap.get(p.student_id);
      if (!s) continue;
      byClass[s.class_type] += Number(p.amount);
    }
    return { total, byClass };
  }, [inMonth, cls, stuMap]);

  // Chỉ tính "dự kiến" cho học sinh ĐẾN KỲ ĐÓNG trong tháng:
  // - khóa mới bắt đầu trong tháng, HOẶC
  // - buổi cuối khóa (NKT thực tế) rơi vào tháng → chốt đóng khóa mới
  const collection = useMemo(() => {
    const scope = students.filter((s) => {
      if (cls !== "Tất cả" && s.class_type !== cls) return false;
      const startsThisMonth = s.start_date.slice(0, 7) === month;
      const actualEnd = addScheduledDays(s.end_date, s.schedule_slots ?? [], s.reserve_days ?? 0);
      const endsThisMonth = actualEnd.slice(0, 7) === month;
      return startsThisMonth || (endsThisMonth && s.status !== "Hoàn thành");
    });
    const paidIds = new Set(inMonth.map((p) => p.student_id));
    const paid = scope.filter((s) => paidIds.has(s.id));
    const unpaid = scope.filter((s) => !paidIds.has(s.id));
    const expected = scope.reduce((a, s) => a + Number(s.tuition), 0);
    const collected = inMonth
      .filter((p) => cls === "Tất cả" || stuMap.get(p.student_id)?.class_type === cls)
      .reduce((a, b) => a + Number(b.amount), 0);
    return { scope, paid, unpaid, expected, collected };
  }, [students, inMonth, cls, stuMap, month]);

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" />Học phí {fmtMonth(monthISO)}</CardTitle>
            <CardDescription>Danh sách đóng học phí theo tháng và thống kê.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[185px] pr-2" />
            <Select value={cls} onValueChange={(v) => setCls(v as any)}>
              <SelectTrigger className="w-auto min-w-[140px]"><SelectValue /></SelectTrigger>

              <SelectContent>
                <SelectItem value="Tất cả">Tất cả lớp</SelectItem>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => {
              if (filtered.length === 0) return toast.info("Không có dữ liệu để xuất");
              exportXlsx(`hoc-phi-${month}`, [{
                name: "Học phí",
                rows: [
                  ["Học sinh", "Lớp", "Tháng", "Kỳ", "Số tiền", "Ngày đóng", "Ghi chú"],
                  ...filtered.map((p) => {
                    const s = stuMap.get(p.student_id)!;
                    return [s.name, s.class_type, p.month.slice(0, 7), p.ky_index, Number(p.amount), fmtDate(p.paid_date), p.note ?? ""];
                  }),
                ],
              }]);
              toast.success("Đã xuất dữ liệu học phí");
            }}><Download className="mr-1 h-4 w-4" />Xuất dữ liệu</Button>
            <RecordPaymentDialog students={students} trigger={<Button><Plus className="mr-1 h-4 w-4" />Ghi nhận</Button>} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatBox label={`Tổng ${cls === "Tất cả" ? "" : "lớp " + cls}`} value={stats.total} />
            <StatBox label="Piano" value={stats.byClass.Piano} tint="piano" />
            <StatBox label="Múa" value={stats.byClass["Múa"]} tint="mua" />
            <StatBox label="Vẽ" value={stats.byClass["Vẽ"]} tint="ve" />
          </div>

          <div className="mb-4 rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              <SummaryBox label="Đến kỳ đóng" value={collection.scope.length} suffix="" />
              <SummaryBox label="Đã đóng" value={collection.paid.length} suffix={`/${collection.scope.length}`} tone="success" />
              <SummaryBox label="Chưa đóng" value={collection.unpaid.length} suffix={`/${collection.scope.length}`} tone="warning" />
              <SummaryBox label="Thu / Dự kiến" value={collection.collected} suffix={` / ${collection.expected.toLocaleString("vi-VN")}đ`} isMoney />
            </div>
            {collection.unpaid.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Học sinh chưa đóng học phí tháng này:</p>
                <div className="flex flex-wrap gap-1.5">
                  {collection.unpaid.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-[color:var(--warning)]">
                      {s.name} · {s.class_type}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Tìm học sinh trong tháng..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          </div>

          {filtered.length === 0 ? (
            <EmptyState text="Chưa có ghi nhận đóng học phí phù hợp." />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Học sinh</TableHead>
                    <TableHead>Lớp</TableHead>
                    <TableHead>Tháng</TableHead>
                    <TableHead className="text-center">Kỳ</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Ngày đóng</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const s = stuMap.get(p.student_id)!;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{classChip(s.class_type)}</TableCell>
                        <TableCell>{fmtMonth(p.month)}</TableCell>
                        <TableCell className="text-center">{p.ky_index}</TableCell>
                        <TableCell className="text-right font-semibold">{Number(p.amount).toLocaleString("vi-VN")}đ</TableCell>
                        <TableCell>{fmtDate(p.paid_date)}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{p.note}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <EditPaymentDialog existing={p} student={stuMap.get(p.student_id)} trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
                            <DeletePaymentButton id={p.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <StudentTuitionLookup students={students} payments={payments} />
    </div>
  );
}

function SummaryBox({ label, value, suffix, tone, isMoney }: { label: string; value: number; suffix?: string; tone?: "success" | "warning"; isMoney?: boolean }) {
  const toneCls = tone === "success" ? "text-[color:var(--success)]" : tone === "warning" ? "text-[color:var(--warning)]" : "text-foreground";
  return (
    <div className="rounded-md bg-background p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-base font-bold ${toneCls}`}>{isMoney ? value.toLocaleString("vi-VN") + "đ" : value}{suffix ? <span className="text-xs font-normal text-muted-foreground">{suffix}</span> : null}</p>
    </div>
  );
}


function StatBox({ label, value, tint }: { label: string; value: number; tint?: "piano" | "mua" | "ve" }) {
  const tintCls = tint === "piano" ? "bg-piano/10 text-piano" : tint === "mua" ? "bg-mua/10 text-mua" : tint === "ve" ? "bg-ve/20 text-[color:var(--ve-foreground)]" : "bg-primary/10 text-primary";
  return (
    <div className={`rounded-lg p-3 ${tintCls}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-bold">{value.toLocaleString("vi-VN")}đ</p>
    </div>
  );
}

function DeletePaymentButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deletePayment);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payments"] }); toast.success("Đã xóa"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm("Xóa ghi nhận này?") && mut.mutate()}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

/** Sửa ghi nhận học phí: sửa được cả thông tin khóa học đã nhập khi ghi nhận */
function EditPaymentDialog({ existing, student, trigger }: { existing: TuitionPayment; student?: Student; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const save = useServerFn(upsertPayment);
  const saveStudent = useServerFn(upsertStudent);
  const [amount, setAmount] = useState(Number(existing.amount));
  const [paidDate, setPaidDate] = useState(existing.paid_date);
  const [note, setNote] = useState(existing.note ?? "");

  const [name, setName] = useState(student?.name ?? "");
  const [age, setAge] = useState(student?.age ?? 8);
  const [clsType, setClsType] = useState<ClassType>((student?.class_type ?? "Piano") as ClassType);
  const [totalSessions, setTotalSessions] = useState(student?.total_sessions ?? 24);
  const [courseIndex, setCourseIndex] = useState(student?.course_index ?? 1);
  const [startDate, setStartDate] = useState(student?.start_date ?? "");
  const [endDate, setEndDate] = useState(student?.end_date ?? "");

  const mut = useMutation({
    mutationFn: async () => {
      if (student) {
        await saveStudent({ data: {
          id: student.id,
          name: name.trim(),
          age: Number(age),
          class_type: clsType,
          tuition: Number(amount),
          start_date: startDate,
          end_date: endDate,
          status: student.status,
          reserve_days: student.reserve_days ?? 0,
          total_sessions: Number(totalSessions),
          course_index: Number(courseIndex),
          schedule_slots: student.schedule_slots ?? [],
          person_id: student.person_id ?? null,
        } as any });
      }
      await save({ data: {
        id: existing.id,
        student_id: existing.student_id,
        month: existing.month,
        amount: Number(amount),
        paid_date: paidDate,
        ky_index: Number(courseIndex),
        note: note || null,
      } as any });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success("Đã cập nhật");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Sửa ghi nhận học phí</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          {student && (
            <>
              <div className="grid gap-1">
                <Label>Tên học sinh</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Tuổi</Label>
                  <Input type="number" min={1} value={age} onChange={(e) => setAge(Number(e.target.value))} />
                </div>
                <div className="grid gap-1">
                  <Label>Lớp học</Label>
                  <Select value={clsType} onValueChange={(v) => {
                    const c = v as ClassType;
                    setClsType(c);
                    setTotalSessions(defaultSessionsFor(c));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Tổng số buổi/khóa</Label>
                  <Input type="number" min={1} value={totalSessions} onChange={(e) => setTotalSessions(Number(e.target.value))} />
                </div>
                <div className="grid gap-1">
                  <Label>Tên khóa</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary">{coursePrefix(clsType)}</span>
                    <Input type="number" min={1} value={courseIndex} onChange={(e) => setCourseIndex(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Ngày bắt đầu</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label>Ngày kết thúc</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            </>
          )}
          <div className="grid gap-1">
            <Label>Số tiền (VNĐ)</Label>
            <Input inputMode="numeric" value={formatMoney(amount)} onChange={(e) => setAmount(parseMoney(e.target.value))} />
          </div>
          <div className="grid gap-1">
            <Label>Ngày đóng</Label>
            <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Ghi chú</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Không bắt buộc" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ghi nhận học phí: nhập đầy đủ thông tin khóa học → tự tạo/cập nhật học sinh */
function RecordPaymentDialog({ students, trigger }: { students: Student[]; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const savePayment = useServerFn(upsertPayment);
  const saveStudent = useServerFn(upsertStudent);

  const [mode, setMode] = useState<"next" | "class" | "new">("next");
  const [baseId, setBaseId] = useState<string>("");
  const [paidDate, setPaidDate] = useState(toLocalISO(new Date()));

  const emptyForm = (cls: ClassType = "Piano") => ({
    name: "",
    age: 8,
    class_type: cls,
    tuition: defaultTuitionFor(cls),
    total_sessions: defaultSessionsFor(cls),
    course_index: 1,
    schedule_slots: [] as ScheduleSlot[],
    start_date: toLocalISO(new Date()),
    end_date: "",
  });
  const [form, setForm] = useState(() => emptyForm());
  const [tuitionStr, setTuitionStr] = useState(() => formatMoney(defaultTuitionFor("Piano")));

  // Học sinh còn hiệu lực để chọn "Khóa tiếp theo"
  const activeStudents = useMemo(
    () => students.filter((s) => s.status === "Đang học" || s.status === "Hoàn thành"),
    [students],
  );
  // "Học lớp mới": chỉ học sinh đang học
  const studyingStudents = useMemo(() => students.filter((s) => s.status === "Đang học"), [students]);
  const base = useMemo(() => students.find((s) => s.id === baseId), [students, baseId]);

  // Các khóa khác đang hiệu lực của cùng một hồ sơ học sinh (để kiểm tra trùng lịch)
  const siblingCourses = useMemo(() => {
    if (!base) return [] as Student[];
    return students.filter(
      (s) =>
        s.id !== base.id &&
        (base.person_id ? s.person_id === base.person_id : s.name.trim().toLowerCase() === base.name.trim().toLowerCase() && s.age === base.age) &&
        (s.status === "Đang học" || s.status === "Chuẩn bị"),
    );
  }, [students, base]);

  const pickBase = (id: string) => {
    setBaseId(id);
    const s = students.find((x) => x.id === id);
    if (!s) return;
    const slots = (s.schedule_slots ?? []) as ScheduleSlot[];

    if (mode === "class") {
      // Đăng ký lớp khác cho học sinh đang học: giữ hồ sơ, nhập lịch mới
      const other = CLASSES.find((c) => c !== s.class_type) as ClassType;
      const t = defaultTuitionFor(other);
      setForm({
        name: s.name,
        age: s.age,
        class_type: other,
        tuition: t,
        total_sessions: defaultSessionsFor(other),
        course_index: 1,
        schedule_slots: [],
        start_date: toLocalISO(new Date()),
        end_date: "",
      });
      setTuitionStr(formatMoney(t));
      return;
    }

    const actualEnd = addScheduledDays(s.end_date, slots, s.reserve_days ?? 0);
    const start = nextScheduledDate(actualEnd, slots);
    const end = computeEndDate(start, slots, s.total_sessions) ?? "";
    setForm({
      name: s.name,
      age: s.age,
      class_type: s.class_type,
      tuition: Number(s.tuition),
      total_sessions: s.total_sessions,
      course_index: (s.course_index ?? 1) + 1,
      schedule_slots: slots,
      start_date: start,
      end_date: end,
    });
    setTuitionStr(formatMoney(Number(s.tuition)));
  };

  // Lịch mới không được trùng bất kỳ lịch nào của các lớp đang học
  const scheduleConflict = useMemo(() => {
    if (mode !== "class" || form.schedule_slots.length === 0) return null as string | null;
    for (const other of siblingCourses.concat(base ? [base] : [])) {
      for (const b of (other.schedule_slots ?? []) as ScheduleSlot[]) {
        for (const a of form.schedule_slots) {
          if (a.day === b.day && a.start < b.end && b.start < a.end) {
            return `Trùng lịch với lớp ${other.class_type} (${DAYS[a.day]} ${b.start}–${b.end})`;
          }
        }
      }
    }
    return null;
  }, [mode, form.schedule_slots, siblingCourses, base]);

  const autoEnd = useMemo(
    () => computeEndDate(form.start_date, form.schedule_slots, form.total_sessions),
    [form.start_date, form.schedule_slots, form.total_sessions],
  );
  const perWeek = weeklySessions(form.schedule_slots);
  const slotDays = new Set(form.schedule_slots.map((s) => s.day));

  const setSlotField = (idx: number, patch: Partial<ScheduleSlot>) =>
    setForm((f) => {
      const arr = f.schedule_slots.slice();
      arr[idx] = { ...arr[idx], ...patch };
      return { ...f, schedule_slots: arr };
    });
  const addSlot = () => setForm((f) => ({ ...f, schedule_slots: [...f.schedule_slots, { day: 1, start: "16:00", end: "17:00" }] }));
  const removeSlot = (idx: number) => setForm((f) => ({ ...f, schedule_slots: f.schedule_slots.filter((_, i) => i !== idx) }));

  const mut = useMutation({
    mutationFn: async () => {
      const endDate = form.end_date || autoEnd || "";
      // Khóa tiếp theo mà khóa hiện tại vẫn đang học → "Chuẩn bị"
      const status = mode === "next" && base && base.status === "Đang học" ? "Chuẩn bị" : "Đang học";
      const res: any = await saveStudent({ data: {
        name: form.name.trim(),
        age: Number(form.age),
        class_type: form.class_type,
        tuition: Number(form.tuition),
        start_date: form.start_date,
        end_date: endDate,
        status,
        reserve_days: 0,
        total_sessions: Number(form.total_sessions),
        course_index: Number(form.course_index),
        schedule_slots: form.schedule_slots,
        person_id: mode === "new" ? null : (base?.person_id ?? null),
      } as any });
      const newId = res?.id as string;
      if (!newId) throw new Error("Không lấy được mã học sinh vừa tạo");
      await savePayment({ data: {
        student_id: newId,
        month: monthKey(form.start_date),
        amount: Number(form.tuition),
        paid_date: paidDate,
        ky_index: Number(form.course_index),
        note: null,
      } as any });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success("Đã ghi nhận học phí và cập nhật danh sách học sinh");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Ghi nhận đóng học phí</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Chế độ</Label>
            <div className="inline-flex flex-wrap rounded-md border bg-muted/40 p-0.5">
              <Button size="sm" variant={mode === "next" ? "default" : "ghost"}
                onClick={() => { setMode("next"); setForm(emptyForm()); setBaseId(""); }}>Khóa tiếp theo</Button>
              <Button size="sm" variant={mode === "class" ? "default" : "ghost"}
                onClick={() => { setMode("class"); setForm(emptyForm()); setBaseId(""); }}>Học lớp mới</Button>
              <Button size="sm" variant={mode === "new" ? "default" : "ghost"}
                onClick={() => { setMode("new"); setBaseId(""); setForm(emptyForm()); setTuitionStr(formatMoney(defaultTuitionFor("Piano"))); }}>Học sinh mới</Button>
            </div>
          </div>

          {mode !== "new" && (
            <div className="grid gap-2">
              <Label>{mode === "class" ? "Học sinh đang học (đăng ký thêm lớp)" : "Học sinh đang học"}</Label>
              <Select value={baseId} onValueChange={pickBase}>
                <SelectTrigger><SelectValue placeholder="Chọn học sinh..." /></SelectTrigger>
                <SelectContent>
                  {(mode === "class" ? studyingStudents : activeStudents).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {coursePrefix(s.class_type)}{s.course_index ?? 1} · {s.class_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === "class" && (
                <p className="text-xs text-muted-foreground">Lịch học lớp mới không được trùng với lịch các lớp đang học của học sinh này.</p>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <Label>Tên học sinh</Label>
            <Input value={form.name} disabled={mode !== "new"} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Tuổi</Label>
              <Input type="number" min={1} max={120} value={form.age} onChange={(e) => setForm({ ...form, age: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label>Lớp học</Label>
              <Select value={form.class_type} disabled={mode === "next"} onValueChange={(v) => {
                const cls = v as ClassType;
                const t = defaultTuitionFor(cls);
                setForm((f) => ({ ...f, class_type: cls, total_sessions: defaultSessionsFor(cls), tuition: t }));
                setTuitionStr(formatMoney(t));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Học phí/khóa (VNĐ)</Label>
              <Input inputMode="numeric" value={tuitionStr} onChange={(e) => {
                const n = parseMoney(e.target.value);
                setTuitionStr(formatMoney(n));
                setForm((f) => ({ ...f, tuition: n }));
              }} />
            </div>
            <div className="grid gap-2">
              <Label>Tổng số buổi/khóa</Label>
              <Input type="number" min={1} value={form.total_sessions} onChange={(e) => setForm({ ...form, total_sessions: Number(e.target.value) })} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Tên khóa</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-primary">{coursePrefix(form.class_type)}</span>
              <Input type="number" min={1} value={form.course_index} className="w-24"
                onChange={(e) => setForm({ ...form, course_index: Math.max(1, Number(e.target.value) || 1) })} />
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Khung giờ học ({perWeek} buổi/tuần)</Label>
              <Button type="button" size="sm" variant="outline" onClick={addSlot}><Plus className="mr-1 h-4 w-4" />Thêm khung giờ</Button>
            </div>
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
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label>Ngày bắt đầu</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Ngày kết thúc</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              {autoEnd && autoEnd !== form.end_date && (
                <button type="button" className="text-left text-xs text-primary hover:underline" onClick={() => setForm((f) => ({ ...f, end_date: autoEnd }))}>
                  Dùng ngày tự động: {fmtDate(autoEnd)}
                </button>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Ngày đóng</Label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button
            disabled={mut.isPending}
            onClick={() => {
              if (!form.name.trim()) return toast.error("Vui lòng nhập tên học sinh");
              if (mode !== "new" && !base) return toast.error("Vui lòng chọn học sinh");
              if (mode === "class") {
                if (base && form.class_type === base.class_type) return toast.error("Vui lòng chọn lớp khác với lớp đang học");
                if (scheduleConflict) return toast.error(scheduleConflict);
              }
              if (perWeek < 2) return toast.error("Học sinh phải học tối thiểu 2 buổi/tuần");
              for (const s of form.schedule_slots) if (s.start >= s.end) return toast.error("Khung giờ không hợp lệ");
              const sDow = dayOfWeekOf(form.start_date);
              if (sDow === null || !slotDays.has(sDow)) return toast.error("Ngày bắt đầu không trùng lịch học");
              const endDate = form.end_date || autoEnd || "";
              const eDow = dayOfWeekOf(endDate);
              if (eDow === null || !slotDays.has(eDow)) return toast.error("Ngày kết thúc không trùng lịch học");
              mut.mutate();
            }}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudentTuitionLookup({ students, payments }: { students: Student[]; payments: TuitionPayment[] }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const list = students.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
    return groupByPerson(list).map((g) => {
      const ids = new Set(g.courses.map((c) => c.id));
      const paid = payments
        .filter((p) => ids.has(p.student_id))
        .sort((a, b) => a.paid_date.localeCompare(b.paid_date));
      const total = paid.reduce((a, b) => a + Number(b.amount), 0);
      const byId = new Map(g.courses.map((c) => [c.id, c] as const));
      return { g, paid, total, byId };
    });
  }, [q, students, payments]);

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5 text-primary" />Tra cứu học phí theo học sinh</CardTitle>
        <CardDescription>Mỗi học sinh một hồ sơ, gộp tất cả khóa đã học.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Nhập tên học sinh..." value={q} onChange={(e) => setQ(e.target.value)} />
        {q.trim() && results.length === 0 && <EmptyState text="Không tìm thấy học sinh." />}
        <div className="space-y-3">
          {results.map(({ g, paid, total, byId }) => (
            <div key={g.key} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{g.name} <span className="text-xs font-normal text-muted-foreground">({g.age} tuổi)</span></p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {Array.from(new Set(g.courses.map((c) => c.class_type))).map((c) => (
                      <span key={c}>{classChip(c)}</span>
                    ))}
                    <span>{g.courses.length} khóa · {paid.length} kỳ · Tổng {total.toLocaleString("vi-VN")}đ</span>
                  </div>
                </div>
              </div>
              {paid.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {paid.map((p) => {
                    const c = byId.get(p.student_id);
                    return (
                      <li key={p.id} className="flex items-center justify-between rounded border-l-2 border-primary bg-muted/40 px-2 py-1">
                        <span>
                          {c ? `${coursePrefix(c.class_type)}${c.course_index ?? 1} · ` : ""}
                          {fmtMonth(p.month)} · Kỳ {p.ky_index} · {fmtDate(p.paid_date)}
                        </span>
                        <span className="font-medium">{Number(p.amount).toLocaleString("vi-VN")}đ</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
