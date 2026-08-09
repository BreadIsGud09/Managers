import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Download, Loader2, Pencil, Plus, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui-bits";
import {
  CLASSES, addScheduledDays, computeEndDate, coursePrefix, fmtDate, fmtMonth, formatMoney, parseMoney,
  type ClassType, type Student, type TuitionPayment,
} from "@/lib/shared";
import { listPayments } from "@/lib/tuition.functions";
import { listStudents } from "@/lib/students.functions";
import { deleteFinanceEntry, listExpenseCategories, listFinanceEntries, upsertFinanceEntry } from "@/lib/finance.functions";
import { exportXlsx } from "@/lib/export";

type Entry = {
  id: string; month: string; kind: "thu" | "chi"; category: string; amount: number; note: string | null; is_fixed: boolean;
  class_type: string | null; income_type: "hoc_phi" | "khac" | null; student_name: string | null;
  course_label: string | null; term_start: string | null; term_end: string | null; paid_date: string | null;
  quantity?: number | null; unit_amount?: number | null;
};

type Category = { id: string; name: string; default_amount: number; sort_order: number; active: boolean };

const DEFAULT_EXPENSES = ["Tiền điện", "Tiền nước", "Lương giáo viên", "Tiền thuế"];

export function FinanceTab() {
  const fetchPayments = useServerFn(listPayments);
  const fetchEntries = useServerFn(listFinanceEntries);
  const fetchCats = useServerFn(listExpenseCategories);
  const fetchStudents = useServerFn(listStudents);

  const { data: payments = [] } = useQuery<TuitionPayment[]>({ queryKey: ["payments"], queryFn: () => fetchPayments() as any });
  const { data: entries = [] } = useQuery<Entry[]>({ queryKey: ["finance-entries"], queryFn: () => fetchEntries() as any });
  const { data: cats = [] } = useQuery<Category[]>({ queryKey: ["expense-cats"], queryFn: () => fetchCats() as any });
  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchStudents() as any });

  const now = new Date();
  const [view, setView] = useState<"month" | "year">("month");
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [cls, setCls] = useState<"Tất cả" | ClassType>("Tất cả");

  const stuMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const period = view === "month" ? month : year;
  const inPeriod = (iso: string) => (view === "month" ? iso.slice(0, 7) === month : iso.slice(0, 4) === year);
  const matchClass = (c: string | null | undefined) => cls === "Tất cả" || !c || c === cls;

  const paidRows = useMemo(
    () => payments.filter((p) => inPeriod(p.month) && (cls === "Tất cả" || stuMap.get(p.student_id)?.class_type === cls)),
    [payments, view, month, year, cls, stuMap],
  );
  const periodEntries = useMemo(() => entries.filter((e) => inPeriod(e.month) && matchClass(e.class_type)), [entries, view, month, year, cls]);

  const tuitionEntries = useMemo(() => periodEntries.filter((e) => e.kind === "thu" && e.income_type === "hoc_phi"), [periodEntries]);
  const otherEntries = useMemo(() => periodEntries.filter((e) => e.kind === "thu" && e.income_type !== "hoc_phi"), [periodEntries]);
  const expenseEntries = useMemo(() => periodEntries.filter((e) => e.kind === "chi"), [periodEntries]);

  /** Tự động lấy học phí từ học sinh có khóa bắt đầu trong kỳ (nếu chưa ghi nhận ở nơi khác) */
  const autoTuitionRows = useMemo(() => {
    return students.filter((s) => {
      if (cls !== "Tất cả" && s.class_type !== cls) return false;
      if (!s.start_date || !inPeriod(s.start_date)) return false;
      const label = `${coursePrefix(s.class_type)}${s.course_index ?? 1}`;
      const paidHere = payments.some((p) => p.student_id === s.id && p.month.slice(0, 7) === s.start_date.slice(0, 7));
      const manual = entries.some((e) => e.income_type === "hoc_phi" && e.student_name === s.name && (e.course_label ?? "") === label);
      return !paidHere && !manual;
    });
  }, [students, payments, entries, cls, view, month, year]);

  const sum = (rows: { amount: number }[]) => rows.reduce((a, b) => a + Number(b.amount), 0);
  const tuitionIncome = sum(paidRows as any) + sum(tuitionEntries) + autoTuitionRows.reduce((a, s) => a + Number(s.tuition), 0);
  const otherIncome = sum(otherEntries);
  const expense = sum(expenseEntries);
  const income = tuitionIncome + otherIncome;
  const profit = income - expense;


  const byMonth = useMemo(() => {
    if (view !== "year") return [];
    const rows: { m: string; thu: number; chi: number }[] = [];
    for (let i = 1; i <= 12; i++) {
      const key = `${year}-${String(i).padStart(2, "0")}`;
      const thu =
        payments
          .filter((p) => p.month.slice(0, 7) === key && (cls === "Tất cả" || stuMap.get(p.student_id)?.class_type === cls))
          .reduce((a, b) => a + Number(b.amount), 0) +
        entries.filter((e) => e.month.slice(0, 7) === key && e.kind === "thu" && matchClass(e.class_type)).reduce((a, b) => a + Number(b.amount), 0) +
        students
          .filter((s) => (cls === "Tất cả" || s.class_type === cls) && s.start_date?.slice(0, 7) === key
            && !payments.some((p) => p.student_id === s.id && p.month.slice(0, 7) === key)
            && !entries.some((e) => e.income_type === "hoc_phi" && e.student_name === s.name && (e.course_label ?? "") === `${coursePrefix(s.class_type)}${s.course_index ?? 1}`))
          .reduce((a, s) => a + Number(s.tuition), 0);

      const chi = entries
        .filter((e) => e.month.slice(0, 7) === key && e.kind === "chi" && matchClass(e.class_type))
        .reduce((a, b) => a + Number(b.amount), 0);
      if (thu || chi) rows.push({ m: key, thu, chi });
    }
    return rows;
  }, [view, year, payments, entries, cls, stuMap, students]);

  const doExport = () => {
    const label = view === "month" ? fmtMonth(month + "-01") : `Năm ${year}`;
    exportXlsx(`tai-chinh-${period}`, [
      {
        name: "Tổng hợp",
        rows: [
          ["Kỳ", label],
          ["Lớp", cls],
          ["Thu học phí", tuitionIncome],
          ["Thu khác", otherIncome],
          ["Tổng thu", income],
          ["Tổng chi", expense],
          ["Lợi nhuận", profit],
        ],
      },
      {
        name: "Thu học phí",
        rows: [
          ["Học sinh", "Lớp", "Khóa", "Kỳ học", "Ngày đóng", "Số tiền"],
          ...paidRows.map((p) => {
            const s = stuMap.get(p.student_id);
            return [
              s?.name ?? "", s?.class_type ?? "", s ? `${coursePrefix(s.class_type)}${s.course_index ?? 1}` : "",
              s ? `${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}` : "", fmtDate(p.paid_date), Number(p.amount),
            ];
          }),
          ...autoTuitionRows.map((s) => [
            s.name, s.class_type, `${coursePrefix(s.class_type)}${s.course_index ?? 1}`,
            `${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}`, fmtDate(s.start_date), Number(s.tuition),
          ]),
          ...tuitionEntries.map((e) => [
            e.student_name ?? e.category, e.class_type ?? "", e.course_label ?? "",
            e.term_start && e.term_end ? `${fmtDate(e.term_start)} → ${fmtDate(e.term_end)}` : "",
            e.paid_date ? fmtDate(e.paid_date) : "", Number(e.amount),
          ]),

        ],
      },
      {
        name: "Thu khác - Chi",
        rows: [
          ["Tháng", "Loại", "Lớp", "Khoản mục", "Số tiền", "Ghi chú"],
          ...[...otherEntries, ...expenseEntries].map((e) => [
            e.month.slice(0, 7), e.kind === "thu" ? "Thu khác" : "Chi", e.class_type ?? "Chung", e.category, Number(e.amount), e.note ?? "",
          ]),
        ],
      },
    ]);
    toast.success("Đã xuất báo cáo tài chính");
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" />Tài chính</CardTitle>
            <CardDescription>Thu · Chi · Lợi nhuận theo tháng và theo năm.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={view} onValueChange={(v) => setView(v as "month" | "year")}>
              <SelectTrigger className="w-auto min-w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Theo tháng</SelectItem>
                <SelectItem value="year">Theo năm</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cls} onValueChange={(v) => setCls(v as any)}>
              <SelectTrigger className="w-auto min-w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Tất cả">Tất cả lớp</SelectItem>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            {view === "month" ? (
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[185px] pr-2" />
            ) : (
              <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-[110px]" />
            )}
            <Button variant="outline" onClick={doExport}><Download className="mr-1 h-4 w-4" />Xuất dữ liệu</Button>
            <EntryDialog
              cats={cats}
              students={students}
              defaultMonth={view === "month" ? month : `${year}-01`}
              defaultClass={cls === "Tất cả" ? null : cls}
              trigger={<Button><Plus className="mr-1 h-4 w-4" />Thêm khoản</Button>}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Box label="Thu học phí" value={tuitionIncome} tone="success" />
            <Box label="Thu khác" value={otherIncome} tone="success" />
            <Box label="Tổng chi" value={expense} tone="danger" />
            <Box label="Lợi nhuận" value={profit} tone={profit >= 0 ? "primary" : "danger"} />
          </div>

          {view === "year" && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Chi tiết theo tháng · {year}</h3>
              {byMonth.length === 0 ? <EmptyState text="Chưa có dữ liệu trong năm này." /> : (
                <div className="-mx-4 overflow-x-auto sm:mx-0">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Tháng</TableHead>
                      <TableHead className="text-right">Thu</TableHead>
                      <TableHead className="text-right">Chi</TableHead>
                      <TableHead className="text-right">Lợi nhuận</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {byMonth.map((r) => (
                        <TableRow key={r.m}>
                          <TableCell>{fmtMonth(r.m + "-01")}</TableCell>
                          <TableCell className="text-right text-[color:var(--success)]">{formatMoney(r.thu)}đ</TableCell>
                          <TableCell className="text-right text-destructive">{formatMoney(r.chi)}đ</TableCell>
                          <TableCell className="text-right font-semibold">{formatMoney(r.thu - r.chi)}đ</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-[color:var(--success)]" />Thu học phí</h3>
            {paidRows.length === 0 && tuitionEntries.length === 0 && autoTuitionRows.length === 0 ? (
              <EmptyState text="Chưa có khoản thu học phí trong kỳ này." />

            ) : (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Học sinh</TableHead>
                    <TableHead>Lớp</TableHead>
                    <TableHead>Khóa</TableHead>
                    <TableHead>Kỳ học</TableHead>
                    <TableHead>Ngày đóng</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {paidRows.map((p) => {
                      const s = stuMap.get(p.student_id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{s?.name ?? "—"}</TableCell>
                          <TableCell>{s?.class_type ?? "—"}</TableCell>
                          <TableCell>{s ? `${coursePrefix(s.class_type)}${s.course_index ?? 1}` : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s ? `${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}` : "—"}</TableCell>
                          <TableCell>{fmtDate(p.paid_date)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatMoney(Number(p.amount))}đ</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">Từ trang Học phí</TableCell>
                        </TableRow>
                      );
                    })}
                    {autoTuitionRows.map((s) => (
                      <TableRow key={`auto-${s.id}`}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{s.class_type}</TableCell>
                        <TableCell>{coursePrefix(s.class_type)}{s.course_index ?? 1}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</TableCell>
                        <TableCell>{fmtDate(s.start_date)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatMoney(Number(s.tuition))}đ</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">Tự động từ danh sách học sinh</TableCell>
                      </TableRow>
                    ))}

                    {tuitionEntries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.student_name ?? e.category}</TableCell>
                        <TableCell>{e.class_type ?? "—"}</TableCell>
                        <TableCell>{e.course_label ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.term_start && e.term_end ? `${fmtDate(e.term_start)} → ${fmtDate(e.term_end)}` : "—"}
                        </TableCell>
                        <TableCell>{e.paid_date ? fmtDate(e.paid_date) : "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{formatMoney(Number(e.amount))}đ</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <EntryDialog cats={cats} students={students} defaultMonth={e.month.slice(0, 7)} defaultClass={null} existing={e}
                              trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
                            <DeleteEntryButton id={e.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {otherEntries.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-[color:var(--success)]" />Thu khác</h3>
              <EntryTable rows={otherEntries} cats={cats} students={students} />
            </div>
          )}


          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><TrendingDown className="h-4 w-4 text-destructive" />Khoản chi</h3>
            {expenseEntries.length === 0 ? <EmptyState text="Chưa có khoản chi nào." /> : <EntryTable rows={expenseEntries} cats={cats} students={students} />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EntryTable({ rows, cats, students }: { rows: Entry[]; cats: Category[]; students: Student[] }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Tháng</TableHead>
          <TableHead>Lớp</TableHead>
          <TableHead>Khoản mục</TableHead>
          <TableHead className="text-right">Đơn giá</TableHead>
          <TableHead className="text-center">SL</TableHead>
          <TableHead className="text-right">Thành tiền</TableHead>
          <TableHead>Ghi chú</TableHead>
          <TableHead className="text-right">Thao tác</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell>{e.month.slice(0, 7)}</TableCell>
              <TableCell>{e.class_type ?? "Chung"}</TableCell>
              <TableCell className="font-medium">{e.category}{e.is_fixed && <span className="ml-1 rounded bg-muted px-1 text-[10px]">cố định</span>}</TableCell>
              <TableCell className="text-right">{formatMoney(Number(e.unit_amount || e.amount))}đ</TableCell>
              <TableCell className="text-center">{e.quantity ?? 1}</TableCell>
              <TableCell className="text-right font-semibold">{formatMoney(Number(e.amount))}đ</TableCell>

              <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{e.note}</TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-1">
                  <EntryDialog cats={cats} students={students} defaultMonth={e.month.slice(0, 7)} defaultClass={null} existing={e}
                    trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
                  <DeleteEntryButton id={e.id} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Box({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" | "primary" }) {
  const cls = tone === "success" ? "bg-success/10 text-[color:var(--success)]" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary";
  return (
    <div className={`rounded-lg p-3 ${cls}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-bold">{formatMoney(value)}đ</p>
    </div>
  );
}

function DeleteEntryButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteFinanceEntry);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["finance-entries"] }); toast.success("Đã xóa"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm("Xóa khoản này?") && mut.mutate()}><Trash2 className="h-4 w-4" /></Button>;
}

type FormKind = "hoc_phi" | "thu_khac" | "chi";

function EntryDialog({
  cats, students, defaultMonth, defaultClass, existing, trigger,
}: {
  cats: Category[]; students: Student[]; defaultMonth: string; defaultClass: ClassType | null; existing?: Entry; trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const save = useServerFn(upsertFinanceEntry);

  const initKind: FormKind = existing ? (existing.kind === "chi" ? "chi" : existing.income_type === "hoc_phi" ? "hoc_phi" : "thu_khac") : "hoc_phi";
  const [formKind, setFormKind] = useState<FormKind>(initKind);
  const [mode, setMode] = useState<"tiep_theo" | "moi">("tiep_theo");
  const [month, setMonth] = useState(existing?.month.slice(0, 7) ?? defaultMonth);
  const [category, setCategory] = useState(existing?.category ?? "");
  const [amountStr, setAmountStr] = useState(existing ? formatMoney(Number(existing.unit_amount || existing.amount)) : "");
  const [qty, setQty] = useState<number>(existing?.quantity ?? 1);

  const [note, setNote] = useState(existing?.note ?? "");
  const [isFixed, setIsFixed] = useState(existing?.is_fixed ?? false);
  const [classType, setClassType] = useState<string>(existing?.class_type ?? defaultClass ?? "Chung");
  const [studentName, setStudentName] = useState(existing?.student_name ?? "");
  const [studentId, setStudentId] = useState<string>("");
  const [courseLabel, setCourseLabel] = useState(existing?.course_label ?? "");
  const [termStart, setTermStart] = useState(existing?.term_start ?? "");
  const [termEnd, setTermEnd] = useState(existing?.term_end ?? "");
  const [paidDate, setPaidDate] = useState(existing?.paid_date ?? "");

  const classStudents = useMemo(
    () => students.filter((s) => (classType === "Chung" ? true : s.class_type === classType) && s.status !== "Hoàn thành"),
    [students, classType],
  );

  const pickStudent = (id: string) => {
    setStudentId(id);
    const s = students.find((x) => x.id === id);
    if (!s) return;
    const actualEnd = addScheduledDays(s.end_date, s.schedule_slots ?? [], s.reserve_days ?? 0);
    const nextEnd = computeEndDate(actualEnd, s.schedule_slots ?? [], s.total_sessions ?? 24) ?? "";
    setStudentName(s.name);
    setClassType(s.class_type);
    setCourseLabel(`${coursePrefix(s.class_type)}${(s.course_index ?? 1) + 1}`);
    setTermStart(actualEnd);
    setTermEnd(nextEnd);
    setPaidDate(actualEnd);
    setAmountStr(formatMoney(Number(s.tuition)));
    setMonth(actualEnd.slice(0, 7));
  };

  const mut = useMutation({
    mutationFn: () => {
      const isTuition = formKind === "hoc_phi";
      return save({ data: {
        id: existing?.id,
        month: isTuition && paidDate ? paidDate.slice(0, 7) : month,
        kind: formKind === "chi" ? "chi" : "thu",
        category: isTuition ? `Học phí · ${studentName}${courseLabel ? ` (${courseLabel})` : ""}` : category,
        amount: parseMoney(amountStr) * (isTuition ? 1 : Math.max(1, qty)),
        unit_amount: parseMoney(amountStr),
        quantity: isTuition ? 1 : Math.max(1, qty),

        note: note || null,
        is_fixed: formKind === "chi" ? isFixed : false,
        class_type: classType === "Chung" ? null : classType,
        income_type: formKind === "chi" ? null : isTuition ? "hoc_phi" : "khac",
        student_name: isTuition ? studentName : null,
        course_label: isTuition ? courseLabel : null,
        term_start: isTuition ? termStart : null,
        term_end: isTuition ? termEnd : null,
        paid_date: isTuition ? paidDate : null,
      } as any });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-entries"] });
      toast.success(existing ? "Đã cập nhật" : "Đã thêm khoản");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (formKind === "hoc_phi") {
      if (!studentName.trim()) return toast.error("Chọn hoặc nhập tên học sinh");
      if (!paidDate) return toast.error("Chọn ngày đóng");
    } else if (!category.trim()) return toast.error("Nhập tên khoản mục");
    if (parseMoney(amountStr) <= 0) return toast.error("Nhập số tiền");
    mut.mutate();
  };

  const expenseChips = useMemo(() => {
    const names = cats.filter((c) => c.active).map((c) => c.name);
    const extra = DEFAULT_EXPENSES.filter((n) => !names.includes(n));
    return [...cats.filter((c) => c.active), ...extra.map((n) => ({ id: n, name: n, default_amount: 0, sort_order: 99, active: true }))];
  }, [cats]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? "Sửa khoản" : "Thêm khoản thu/chi"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Loại khoản</Label>
            <Select value={formKind} onValueChange={(v) => setFormKind(v as FormKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hoc_phi">Thu học phí</SelectItem>
                <SelectItem value="thu_khac">Thu khác</SelectItem>
                <SelectItem value="chi">Chi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formKind === "hoc_phi" ? (
            <>
              <div className="grid gap-1">
                <Label>Hình thức</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tiep_theo">Học phí khóa tiếp theo (học sinh đang học)</SelectItem>
                    <SelectItem value="moi">Học phí khóa mới (học sinh đăng ký mới)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Lớp</Label>
                  <Select value={classType} onValueChange={(v) => { setClassType(v); setStudentId(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label>Tên khóa</Label>
                  <Input value={courseLabel} onChange={(e) => setCourseLabel(e.target.value)} placeholder="Vd: P2" />
                </div>
              </div>
              {mode === "tiep_theo" ? (
                <div className="grid gap-1">
                  <Label>Học sinh</Label>
                  <Select value={studentId} onValueChange={pickStudent}>
                    <SelectTrigger><SelectValue placeholder="Chọn học sinh" /></SelectTrigger>
                    <SelectContent>
                      {classStudents.length === 0
                        ? <SelectItem value="none" disabled>Không có học sinh</SelectItem>
                        : classStudents.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {coursePrefix(s.class_type)}{s.course_index ?? 1}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-1">
                  <Label>Tên học sinh</Label>
                  <Input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Nhập tên học sinh mới" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Kỳ học từ</Label>
                  <Input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label>Đến ngày</Label>
                  <Input type="date" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-1">
                <Label>Ngày đóng</Label>
                <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label>Tháng</Label>
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="pr-2" />
                </div>
                <div className="grid gap-1">
                  <Label>Lớp</Label>
                  <Select value={classType} onValueChange={setClassType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Chung">Chung (mọi lớp)</SelectItem>
                      {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1">
                <Label>Khoản mục</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={formKind === "chi" ? "Vd: Lương giáo viên" : "Vd: Bán nhạc cụ"} />
                {formKind === "chi" && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {expenseChips.map((c) => (
                      <button key={c.id} type="button" className="rounded-full bg-muted px-2 py-0.5 text-[11px] hover:bg-muted/70"
                        onClick={() => { setCategory(c.name); setIsFixed(true); if (Number(c.default_amount) > 0) setAmountStr(formatMoney(Number(c.default_amount))); }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {formKind === "hoc_phi" ? (
            <div className="grid gap-1">
              <Label>Số tiền (VNĐ)</Label>
              <Input inputMode="numeric" value={amountStr} onChange={(e) => setAmountStr(formatMoney(parseMoney(e.target.value)))} placeholder="0" />
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <div className="grid gap-1">
                <Label>Đơn giá (VNĐ)</Label>
                <Input inputMode="numeric" value={amountStr} onChange={(e) => setAmountStr(formatMoney(parseMoney(e.target.value)))} placeholder="0" />
              </div>
              <div className="grid gap-1">
                <Label>Số lượng</Label>
                <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">Thành tiền: <span className="font-semibold">{formatMoney(parseMoney(amountStr) * Math.max(1, qty))}đ</span></p>
            </div>
          )}

          {formKind === "chi" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isFixed} onChange={(e) => setIsFixed(e.target.checked)} />
              <span>Khoản cố định hàng tháng</span>
            </label>
          )}
          <div className="grid gap-1">
            <Label>Ghi chú</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button disabled={mut.isPending} onClick={submit}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
