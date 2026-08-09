import { useMemo, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, Users, Music, Sparkles, Palette, Columns3, PlusCircle, Download } from "lucide-react";
import { exportXlsx } from "@/lib/export";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classChip, EmptyState, statusBadge } from "@/components/ui-bits";
import { StudentDialog } from "@/components/StudentDialog";
import {
  CLASSES,
  DAYS_SHORT,
  addScheduledDays,
  coursePrefix,
  effectiveStatus,
  fmtDate,
  formatMoney,
  nextScheduledDate,
  computeEndDate,
  slotsPerDayMap,


  type ClassType,
  type Student,
  type StudentStatus,
  type AttendanceRow,
} from "@/lib/shared";
import { deleteStudent, listAttendanceRange, listStudents, upsertStudent } from "@/lib/students.functions";

const ALL_COLS = [
  { key: "name", label: "Họ tên" },
  { key: "course", label: "Tên khóa" },
  { key: "age", label: "Tuổi" },
  { key: "class", label: "Lớp" },
  { key: "tuition", label: "Học phí" },
  { key: "schedule", label: "Lịch học (giờ)" },
  { key: "total", label: "Tổng buổi" },
  { key: "remain", label: "Buổi còn lại" },
  { key: "reserve", label: "Bảo lưu" },
  { key: "term", label: "Kỳ học" },
  { key: "actualEnd", label: "NKT thực tế" },
  { key: "status", label: "Trạng thái" },
  { key: "actions", label: "Thao tác" },
] as const;

type ColKey = typeof ALL_COLS[number]["key"];
const DEFAULT_COLS: ColKey[] = ALL_COLS.map((c) => c.key);

const STATUS_OPTS: StudentStatus[] = ["Đang học", "Chuẩn bị", "Bảo lưu", "Hoàn thành"];

export function StudentsTab() {
  const fetchList = useServerFn(listStudents);
  const fetchAttRange = useServerFn(listAttendanceRange);
  const { data: students = [], isLoading } = useQuery({ queryKey: ["students"], queryFn: () => fetchList() });

  const [filter, setFilter] = useState<ClassType>("Piano");
  const [statusFilter, setStatusFilter] = useState<"Tất cả" | StudentStatus>("Tất cả");
  const [visible, setVisible] = useState<Set<ColKey>>(() => {
    if (typeof window === "undefined") return new Set(DEFAULT_COLS);
    try {
      const raw = localStorage.getItem("students-cols");
      if (raw) return new Set(JSON.parse(raw) as ColKey[]);
    } catch { /* ignore */ }
    return new Set(DEFAULT_COLS);
  });

  useEffect(() => {
    try { localStorage.setItem("students-cols", JSON.stringify(Array.from(visible))); } catch { /* ignore */ }
  }, [visible]);

  const today = new Date();
  const from = new Date(today); from.setFullYear(from.getFullYear() - 2);
  const to = new Date(today);
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = to.toISOString().slice(0, 10);
  const { data: attendedRows = [] } = useQuery<AttendanceRow[]>({
    queryKey: ["attendance-range", fromISO, toISO],
    queryFn: () => fetchAttRange({ data: { from: fromISO, to: toISO } }) as any,
  });

  // 1 giờ học = 1 buổi → quy đổi mỗi ngày điểm danh theo số giờ của các ca trong thứ đó
  const sessionsOnDate = (s: Student | undefined, dateISO: string) => {
    if (!s) return 1;
    const dow = new Date(dateISO + "T00:00:00").getDay();
    const n = slotsPerDayMap(s.schedule_slots ?? []).get(dow) ?? 0;
    return n > 0 ? n : 1;
  };

  const studentById = useMemo(() => new Map((students as Student[]).map((s) => [s.id, s])), [students]);

  // Chỉ tính các buổi nằm trong khóa hiện tại của học sinh (từ ngày bắt đầu → NKT thực tế)
  const inCourse = (s: Student | undefined, dateISO: string) => {
    if (!s?.start_date) return false;
    const actualEnd = addScheduledDays(s.end_date, s.schedule_slots ?? [], s.reserve_days ?? 0);
    return dateISO >= s.start_date && (!actualEnd || dateISO <= actualEnd);
  };

  const attendedByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of attendedRows) {
      const s = studentById.get(r.student_id);
      if (r.status === "Đi học" && inCourse(s, r.date))
        m.set(r.student_id, (m.get(r.student_id) ?? 0) + sessionsOnDate(s, r.date));
    }
    return m;
  }, [attendedRows, studentById]);

  // Cột "Bảo lưu": tổng số buổi bảo lưu (bảng Học sinh bảo lưu) trong khóa đang học
  const reservedByStudent = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of attendedRows) {
      const s = studentById.get(r.student_id);
      if (r.status === "Bảo lưu" && inCourse(s, r.date))
        m.set(r.student_id, (m.get(r.student_id) ?? 0) + sessionsOnDate(s, r.date));
    }
    return m;
  }, [attendedRows, studentById]);


  const remainOf = (s: Student) => Math.max(0, (s.total_sessions ?? 0) - (attendedByStudent.get(s.id) ?? 0));
  const statusOf = (s: Student) => effectiveStatus(s.status, remainOf(s));

  // Tự động chuyển "Đang học" → "Hoàn thành" khi hết buổi;
  // "Chuẩn bị" → "Đang học" khi khóa trước của học sinh đó đã hoàn thành
  const qcAuto = useQueryClient();
  const saveStudent = useServerFn(upsertStudent);
  useEffect(() => {
    const list = students as Student[];
    const done = list.filter((s) => s.status === "Đang học" && (s.total_sessions ?? 0) > 0 && remainOf(s) === 0);
    const promote = list.filter((s) => {
      if (s.status !== "Chuẩn bị") return false;
      const prevActive = list.some(
        (o) => o.id !== s.id && o.name === s.name && o.class_type === s.class_type && statusOf(o) === "Đang học",
      );
      return !prevActive;
    });
    const changes: Array<{ s: Student; status: StudentStatus }> = [
      ...done.map((s) => ({ s, status: "Hoàn thành" as StudentStatus })),
      ...promote.map((s) => ({ s, status: "Đang học" as StudentStatus })),
    ];
    if (changes.length === 0) return;
    (async () => {
      for (const { s, status } of changes) {
        await saveStudent({
          data: {
            id: s.id, name: s.name, age: s.age, class_type: s.class_type, tuition: Number(s.tuition),
            start_date: s.start_date, end_date: s.end_date, status, reserve_days: s.reserve_days ?? 0,
            total_sessions: s.total_sessions, course_index: s.course_index ?? 1, schedule_slots: s.schedule_slots ?? [],
          } as any
        }).catch(() => { });
      }
      qcAuto.invalidateQueries({ queryKey: ["students"] });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, attendedByStudent]);

  const filtered = useMemo(() => {
    let list = (students as Student[]).filter((s) => s.class_type === filter);
    if (statusFilter !== "Tất cả") list = list.filter((s) => statusOf(s) === statusFilter);
    return list;
  }, [students, filter, statusFilter, attendedByStudent]);


  const stats = useMemo(() => {
    const list = students as Student[];
    return {
      total: list.length,
      piano: list.filter((s) => s.class_type === "Piano").length,
      mua: list.filter((s) => s.class_type === "Múa").length,
      ve: list.filter((s) => s.class_type === "Vẽ").length,
    };
  }, [students]);

  const show = (k: ColKey) => visible.has(k);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tổng học sinh" value={stats.total} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Piano" value={stats.piano} icon={<Music className="h-4 w-4" />} tint="piano" />
        <StatCard label="Múa" value={stats.mua} icon={<Sparkles className="h-4 w-4" />} tint="mua" />
        <StatCard label="Vẽ" value={stats.ve} icon={<Palette className="h-4 w-4" />} tint="ve" />
      </div>

      <Card className="shadow-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Danh sách học sinh</CardTitle>
            <CardDescription>Thêm, sửa, xóa và theo dõi trạng thái học sinh.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm"><Columns3 className="mr-1 h-4 w-4" />Cột</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Hiện/ẩn cột</p>
                <div className="space-y-1.5">
                  {ALL_COLS.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                      <Checkbox checked={visible.has(c.key)} onCheckedChange={(v) => {
                        setVisible((prev) => {
                          const n = new Set(prev);
                          if (v) n.add(c.key); else n.delete(c.key);
                          return n;
                        });
                      }} />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Select value={filter} onValueChange={(v) => setFilter(v as ClassType)}>
              <SelectTrigger className="w-auto min-w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-auto min-w-[175px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Tất cả">Tất cả trạng thái</SelectItem>
                {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => {
              if (filtered.length === 0) return toast.info("Không có dữ liệu để xuất");
              exportXlsx("danh-sach-hoc-sinh", [{
                name: "Học sinh",
                rows: [
                  ["Họ tên", "Tên khóa", "Tuổi", "Lớp", "Học phí", "Lịch học", "Tổng buổi", "Bảo lưu", "Bắt đầu", "Kết thúc", "NKT thực tế", "Trạng thái"],
                  ...(filtered as Student[]).map((s) => {
                    const reserved = reservedByStudent.get(s.id) ?? 0;
                    return [
                      s.name, `${coursePrefix(s.class_type)}${s.course_index ?? 1}`, s.age, s.class_type, Number(s.tuition),
                      (s.schedule_slots ?? []).map((sl) => `${DAYS_SHORT[sl.day]} ${sl.start}-${sl.end}`).join(", "),
                      s.total_sessions ?? 0, reserved, fmtDate(s.start_date), fmtDate(s.end_date),
                      fmtDate(addScheduledDays(s.end_date, s.schedule_slots ?? [], reserved)), statusOf(s),
                    ];
                  }),
                ],
              }]);
              toast.success("Đã xuất danh sách học sinh");
            }}><Download className="mr-1 h-4 w-4" />Xuất dữ liệu</Button>
            <StudentDialog trigger={<Button><Plus className="mr-1 h-4 w-4" />Học sinh mới</Button>} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Đang tải...</div>
          ) : filtered.length === 0 ? (
            <EmptyState text="Chưa có học sinh nào. Bấm 'Học sinh mới' để bắt đầu." />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {show("name") && <TableHead>Họ tên</TableHead>}
                    {show("course") && <TableHead className="text-center">Tên khóa</TableHead>}
                    {show("age") && <TableHead>Tuổi</TableHead>}
                    {show("class") && <TableHead>Lớp</TableHead>}
                    {show("tuition") && <TableHead>Học phí</TableHead>}
                    {show("schedule") && <TableHead>Lịch học (giờ)</TableHead>}

                    {show("total") && <TableHead className="text-center">Tổng buổi</TableHead>}
                    {show("remain") && <TableHead className="text-center">Buổi còn lại</TableHead>}
                    {show("reserve") && <TableHead className="text-center">Bảo lưu</TableHead>}
                    {show("term") && <TableHead>Kỳ học</TableHead>}
                    {show("actualEnd") && <TableHead>NKT thực tế</TableHead>}
                    {show("status") && <TableHead>Trạng thái</TableHead>}
                    {show("actions") && <TableHead className="text-right">Thao tác</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filtered as Student[]).map((s) => {
                    const attended = attendedByStudent.get(s.id) ?? 0;
                    const reserved = reservedByStudent.get(s.id) ?? 0;
                    const remain = Math.max(0, (s.total_sessions ?? 0) - attended);
                    const actualEnd = addScheduledDays(s.end_date, s.schedule_slots ?? [], reserved);
                    return (
                      <TableRow key={s.id}>
                        {show("name") && <TableCell className="font-medium">{s.name}</TableCell>}
                        {show("course") && <TableCell className="text-center"><span className="inline-flex min-w-[2.5rem] items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{coursePrefix(s.class_type)}{s.course_index ?? 1}</span></TableCell>}
                        {show("age") && <TableCell>{s.age}</TableCell>}
                        {show("class") && <TableCell>{classChip(s.class_type)}</TableCell>}
                        {show("tuition") && <TableCell>{formatMoney(Number(s.tuition))}đ</TableCell>}
                        {show("schedule") && (
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(s.schedule_slots ?? []).length === 0 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                (s.schedule_slots ?? [])
                                  .slice()
                                  .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
                                  .map((sl, i) => (
                                    <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                                      {DAYS_SHORT[sl.day]} ({sl.start}–{sl.end})
                                    </span>
                                  ))
                              )}
                            </div>
                          </TableCell>
                        )}

                        {show("total") && <TableCell className="text-center">{s.total_sessions ?? "—"}</TableCell>}
                        {show("remain") && (
                          <TableCell className="text-center">
                            <span className={`font-semibold ${remain <= 5 ? "text-[color:var(--warning)]" : ""}`}>{remain}</span>
                            <span className="ml-1 text-xs text-muted-foreground">/{s.total_sessions}</span>
                          </TableCell>
                        )}
                        {show("reserve") && <TableCell className="text-center">{reserved > 0 ? <span className="font-semibold text-primary">{reserved}</span> : <span className="text-muted-foreground">—</span>}</TableCell>}
                        {show("term") && (
                          <TableCell className="text-sm text-muted-foreground">
                            {fmtDate(s.start_date)} → {fmtDate(s.end_date)}
                          </TableCell>
                        )}
                        {show("actualEnd") && (
                          <TableCell className="text-sm">
                            <span className={reserved > 0 ? "font-semibold text-primary" : "text-muted-foreground"}>{fmtDate(actualEnd)}</span>
                          </TableCell>
                        )}
                        {show("status") && <TableCell>{statusBadge(effectiveStatus(s.status, remain))}</TableCell>}
                        {show("actions") && (
                          <TableCell className="text-right">
                            <div className="inline-flex gap-1">
                              <StudentDialog student={s} trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
                              <NewCourseButton student={s} />
                              <DeleteStudentButton id={s.id} name={s.name} />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewCourseButton({ student }: { student: Student }) {
  const qc = useQueryClient();
  const save = useServerFn(upsertStudent);
  const slots = student.schedule_slots ?? [];
  const actualEnd = addScheduledDays(student.end_date, slots, student.reserve_days ?? 0);
  const nextStart = nextScheduledDate(actualEnd, slots);
  const nextEnd = computeEndDate(nextStart, slots, student.total_sessions ?? 24) ?? nextStart;
  const mut = useMutation({
    mutationFn: () => save({
      data: {
        name: student.name,
        age: student.age,
        class_type: student.class_type,
        tuition: Number(student.tuition),
        start_date: nextStart,
        end_date: nextEnd,
        status: "Đang học",
        reserve_days: 0,
        total_sessions: student.total_sessions,
        course_index: (student.course_index ?? 1) + 1,
        schedule_slots: slots,
      } as any
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      toast.success(`Đã tạo khóa mới ${coursePrefix(student.class_type)}${(student.course_index ?? 1) + 1} cho ${student.name}: ${fmtDate(nextStart)} → ${fmtDate(nextEnd)}`);
    },

    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="icon" variant="ghost" className="text-primary hover:bg-primary/10" title="Thêm khóa mới"
      onClick={() => { if (confirm(`Tạo khóa học mới cho "${student.name}"? Khóa cũ vẫn được lưu.`)) mut.mutate(); }}>
      <PlusCircle className="h-4 w-4" />
    </Button>
  );
}

function DeleteStudentButton({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteStudent);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["students"] }); toast.success("Đã xóa học sinh"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      onClick={() => { if (confirm(`Xóa học sinh "${name}"?`)) mut.mutate(); }}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function StatCard({ label, value, icon, tint }: { label: string; value: number; icon: React.ReactNode; tint?: "piano" | "mua" | "ve" }) {
  const tintCls = tint === "piano" ? "bg-piano/10 text-piano" : tint === "mua" ? "bg-mua/10 text-mua" : tint === "ve" ? "bg-ve/20 text-[color:var(--ve-foreground)]" : "bg-primary/10 text-primary";
  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${tintCls}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}
