import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Download, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { classChip, EmptyState } from "@/components/ui-bits";
import { CLASSES, coursePrefix, fmtDate, toLocalISO, type ClassType, type Student } from "@/lib/shared";
import { listAttendance, listStudents } from "@/lib/students.functions";
import { deleteLearningLog, listLearningLogs, upsertLearningLog } from "@/lib/learning.functions";
import { exportXlsx } from "@/lib/export";

export type Attachment = { kind: "image" | "video" | "link"; url: string; label?: string | null };
export type LearningLog = {
  id: string;
  student_id: string | null;
  class_type: ClassType;
  date: string;
  title: string;
  content: string | null;
  attachments: Attachment[];
  is_class_wide: boolean;
};

export function LearningTab() {
  const fetchStudents = useServerFn(listStudents);
  const fetchLogs = useServerFn(listLearningLogs);
  const fetchAtt = useServerFn(listAttendance);
  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchStudents() as any });
  const { data: logs = [] } = useQuery<LearningLog[]>({ queryKey: ["learning-logs"], queryFn: () => fetchLogs() as any });

  const [cls, setCls] = useState<ClassType>("Piano");
  const [studentId, setStudentId] = useState<string>("all");
  const [date, setDate] = useState<string>(toLocalISO(new Date()));
  const todayISO = date;

  const { data: attRows = [] } = useQuery<any[]>({
    queryKey: ["attendance", date],
    queryFn: () => fetchAtt({ data: { date } }) as any,
  });

  const stuMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const inClass = useMemo(() => students.filter((s) => s.class_type === cls), [students, cls]);

  // Học sinh đã được điểm danh "Đi học" trong ngày
  const attendedToday = useMemo(() => {
    const ids = new Set(attRows.filter((r) => r.status === "Đi học").map((r) => r.student_id as string));
    return inClass.filter((s) => ids.has(s.id) && (studentId === "all" || s.id === studentId));
  }, [attRows, inClass, studentId]);

  const scoped = useMemo(() => {
    return logs.filter((l) => {
      if (l.class_type !== cls) return false;
      if (studentId === "all") return true;
      return l.is_class_wide || l.student_id === studentId;
    });
  }, [logs, cls, studentId]);

  const todayLogs = useMemo(() => scoped.filter((l) => l.date === todayISO), [scoped, todayISO]);
  const history = useMemo(() => scoped.filter((l) => l.date !== todayISO), [scoped, todayISO]);

  const nameOf = (l: LearningLog) =>
    l.is_class_wide ? `Cả lớp ${l.class_type}` : (stuMap.get(l.student_id ?? "")?.name ?? "—");

  const doExport = () => {
    if (scoped.length === 0) return toast.info("Không có dữ liệu để xuất");
    exportXlsx(`nhat-ky-hoc-tap-${cls}`, [{
      name: "Nhật ký",
      rows: [
        ["Ngày", "Lớp", "Học sinh", "Tác phẩm/Bài học", "Nội dung", "Đính kèm"],
        ...scoped.map((l) => [
          fmtDate(l.date), l.class_type, nameOf(l), l.title, l.content ?? "",
          (l.attachments ?? []).map((a) => a.url).join(" | "),
        ]),
      ],
    }]);
    toast.success("Đã xuất nhật ký học tập");
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-card">
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />Nhật ký học tập</CardTitle>
            <CardDescription>Tác phẩm/bài học hôm nay và lịch sử cả khóa.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[150px]" />
            <Select value={cls} onValueChange={(v) => { setCls(v as ClassType); setStudentId("all"); }}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả học sinh</SelectItem>
                {inClass.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {coursePrefix(s.class_type)}{s.course_index ?? 1}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={doExport}><Download className="mr-1 h-4 w-4" />Xuất dữ liệu</Button>
            <LogDialog students={inClass} cls={cls} defaultDate={date} trigger={<Button><Plus className="mr-1 h-4 w-4" />Ghi nhật ký</Button>} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Học sinh đã điểm danh · {fmtDate(todayISO)}</h3>
            {attendedToday.length === 0 ? (
              <EmptyState text="Chưa có học sinh nào được điểm danh trong ngày này." />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {attendedToday.map((s) => {
                  const log = todayLogs.find((l) => l.student_id === s.id) ?? todayLogs.find((l) => l.is_class_wide);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.name} · {coursePrefix(s.class_type)}{s.course_index ?? 1}</p>
                        <p className="truncate text-xs text-muted-foreground">{log ? log.title : "Chưa ghi nhật ký"}</p>
                      </div>
                      <LogDialog
                        students={inClass}
                        cls={cls}
                        existing={log && log.student_id === s.id ? log : undefined}
                        defaultStudentId={s.id}
                        defaultDate={todayISO}
                        trigger={<Button size="sm" variant={log && log.student_id === s.id ? "outline" : "default"}>
                          <Pencil className="mr-1 h-4 w-4" />{log && log.student_id === s.id ? "Sửa" : "Thêm"}
                        </Button>}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Nhật ký ngày {fmtDate(todayISO)}</h3>
            {todayLogs.length === 0 ? (
              <EmptyState text="Chưa có bài học nào cho ngày này." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {todayLogs.map((l) => <LogCard key={l.id} log={l} name={nameOf(l)} students={inClass} />)}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">Lịch sử các buổi đã học</h3>
            {history.length === 0 ? (
              <EmptyState text="Chưa có lịch sử." />
            ) : (
              <div className="space-y-2">
                {history.map((l) => <LogCard key={l.id} log={l} name={nameOf(l)} students={inClass} compact />)}
              </div>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function LogCard({ log, name, students, compact }: { log: LearningLog; name: string; students: Student[]; compact?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{fmtDate(log.date)}</span>
            {classChip(log.class_type)}
            <Badge variant="outline">{name}</Badge>
          </div>
          <p className="mt-1 font-semibold">{log.title}</p>
          {log.content && <p className={`mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground ${compact ? "line-clamp-2" : ""}`}>{log.content}</p>}
          {(log.attachments ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {log.attachments.map((a, i) =>
                a.kind === "image" ? (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer">
                    <img src={a.url} alt={a.label ?? log.title} loading="lazy" className="h-16 w-24 rounded border object-cover" />
                  </a>
                ) : (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" className="rounded-full bg-muted px-2 py-1 text-[11px] hover:bg-muted/70">
                    {a.kind === "video" ? "🎬" : "🔗"} {a.label || a.url.slice(0, 40)}
                  </a>
                ),
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <LogDialog students={students} cls={log.class_type} existing={log} trigger={<Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>} />
          <DeleteLogButton id={log.id} />
        </div>
      </div>
    </div>
  );
}

function DeleteLogButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const del = useServerFn(deleteLearningLog);
  const mut = useMutation({
    mutationFn: () => del({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["learning-logs"] }); toast.success("Đã xóa"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => confirm("Xóa mục nhật ký này?") && mut.mutate()}>
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

function LogDialog({ students, cls, existing, trigger, defaultStudentId, defaultDate }: { students: Student[]; cls: ClassType; existing?: LearningLog; trigger: React.ReactNode; defaultStudentId?: string; defaultDate?: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const save = useServerFn(upsertLearningLog);

  const classWideDefault = existing?.is_class_wide ?? cls === "Múa";
  const [isClassWide, setIsClassWide] = useState(classWideDefault);
  const [studentId, setStudentId] = useState(existing?.student_id ?? defaultStudentId ?? students[0]?.id ?? "");
  const [date, setDate] = useState(existing?.date ?? defaultDate ?? toLocalISO(new Date()));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>(existing?.attachments ?? []);
  const [newUrl, setNewUrl] = useState("");
  const [newKind, setNewKind] = useState<Attachment["kind"]>("image");

  const mut = useMutation({
    mutationFn: () => save({ data: {
      id: existing?.id,
      student_id: isClassWide ? null : studentId,
      class_type: cls,
      date,
      title,
      content: content || null,
      attachments,
      is_class_wide: isClassWide,
    } as any }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["learning-logs"] });
      toast.success(existing ? "Đã cập nhật" : "Đã ghi nhật ký");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{existing ? "Sửa nhật ký" : `Ghi nhật ký lớp ${cls}`}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isClassWide} onCheckedChange={(v) => setIsClassWide(!!v)} />
            <span>Bài học chung cả lớp (áp dụng cho lớp Múa)</span>
          </label>
          {!isClassWide && (
            <div className="grid gap-1">
              <Label>Học sinh</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Chọn học sinh" /></SelectTrigger>
                <SelectContent>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {coursePrefix(s.class_type)}{s.course_index ?? 1}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1">
            <Label>Ngày học</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>Tác phẩm / Bài học</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Vd: Für Elise — đoạn A" />
          </div>
          <div className="grid gap-1">
            <Label>Nội dung / Nhận xét</Label>
            <Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Tiến độ, lưu ý, bài tập về nhà..." />
          </div>
          <div className="grid gap-2">
            <Label>File đính kèm (link ảnh / video / tài liệu)</Label>
            <div className="flex gap-2">
              <Select value={newKind} onValueChange={(v) => setNewKind(v as Attachment["kind"])}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Ảnh</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="link">Link</SelectItem>
                </SelectContent>
              </Select>
              <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." />
              <Button type="button" variant="outline" onClick={() => {
                if (!newUrl.trim()) return;
                setAttachments((a) => [...a, { kind: newKind, url: newUrl.trim(), label: null }]);
                setNewUrl("");
              }}>Thêm</Button>
            </div>
            {attachments.length > 0 && (
              <ul className="space-y-1">
                {attachments.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs">
                    <span className="shrink-0">{a.kind === "image" ? "🖼" : a.kind === "video" ? "🎬" : "🔗"}</span>
                    <span className="min-w-0 flex-1 truncate">{a.url}</span>
                    <button type="button" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Hủy</Button>
          <Button disabled={mut.isPending} onClick={() => {
            if (!title.trim()) return toast.error("Nhập tên tác phẩm/bài học");
            if (!isClassWide && !studentId) return toast.error("Chọn học sinh");
            mut.mutate();
          }}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
