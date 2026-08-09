import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CalendarDays, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { classChip, EmptyState } from "@/components/ui-bits";
import { DAYS, fmtDate, toLocalISO, type AttendanceRow, type ScheduleSlot, type Student } from "@/lib/shared";
import { listAttendance, listStudents } from "@/lib/students.functions";
import { sendAttendanceReportTelegram, sendCustomTelegram, sendExpiringTelegram, sendTodayScheduleTelegram } from "@/lib/telegram.functions";

export function NotificationsTab() {
  const fetchList = useServerFn(listStudents);
  const fetchAtt = useServerFn(listAttendance);
  const sendSched = useServerFn(sendTodayScheduleTelegram);
  const sendExp = useServerFn(sendExpiringTelegram);
  const sendAtt = useServerFn(sendAttendanceReportTelegram);

  const today = new Date();
  const todayISO = toLocalISO(today);
  const dow = today.getDay();

  const { data: students = [] } = useQuery<Student[]>({ queryKey: ["students"], queryFn: () => fetchList() as any });
  const { data: attRows = [] } = useQuery<AttendanceRow[]>({ queryKey: ["attendance", todayISO], queryFn: () => fetchAtt({ data: { date: todayISO } }) as any });

  const todayItems = useMemo(() => {
    const items: Array<{ s: Student; slot: ScheduleSlot }> = [];
    for (const s of students) {
      if (s.status === "Bảo lưu") continue;
      for (const sl of (s.schedule_slots ?? []) as ScheduleSlot[]) if (sl.day === dow) items.push({ s, slot: sl });
    }
    items.sort((a, b) => a.slot.start.localeCompare(b.slot.start));
    return items;
  }, [students, dow]);

  const expiring = useMemo(() => {
    const now = new Date();
    const in5 = new Date();
    in5.setDate(now.getDate() + 5);
    return (students as Student[])
      .filter((s) => s.status === "Đang học")
      .filter((s) => {
        const e = new Date(s.end_date);
        return e >= new Date(now.toDateString()) && e <= in5;
      })
      .sort((a, b) => a.end_date.localeCompare(b.end_date));
  }, [students]);

  const attendedToday = useMemo(() => {
    const attMap = new Map(attRows.map((r) => [r.student_id, r] as const));
    return todayItems
      .map(({ s, slot }) => ({ s, slot, rec: attMap.get(s.id) }))
      .filter((x) => x.rec?.status === "Đi học");
  }, [todayItems, attRows]);

  const mutSched = useMutation({ mutationFn: () => sendSched(), onSuccess: () => toast.success("Đã gửi lịch học hôm nay"), onError: (e: Error) => toast.error(e.message) });
  const mutExp = useMutation({ mutationFn: () => sendExp(), onSuccess: () => toast.success("Đã gửi nhắc học phí"), onError: (e: Error) => toast.error(e.message) });
  const mutAtt = useMutation({ mutationFn: () => sendAtt({ data: { date: todayISO } }), onSuccess: () => toast.success("Đã gửi báo cáo điểm danh"), onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Lịch học hôm nay</CardTitle>
            <CardDescription>{DAYS[dow]}, {fmtDate(todayISO)}</CardDescription>
          </div>
          <Button size="sm" onClick={() => mutSched.mutate()} disabled={mutSched.isPending}>
            {mutSched.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Gửi Telegram
          </Button>
        </CardHeader>
        <CardContent>
          {todayItems.length === 0 ? (
            <EmptyState text="Hôm nay không có lịch học." />
          ) : (
            <div className="space-y-2">
              {todayItems.map(({ s, slot }, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-3">
                    {classChip(s.class_type)}
                    <span className="font-medium">{s.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">⏰ {slot.start}–{slot.end}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-[color:var(--success)]" />Điểm danh đúng giờ</CardTitle>
            <CardDescription>Các học sinh đã điểm danh đi học hôm nay</CardDescription>
          </div>
          <Button size="sm" onClick={() => mutAtt.mutate()} disabled={mutAtt.isPending}>
            {mutAtt.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Gửi Telegram
          </Button>
        </CardHeader>
        <CardContent>
          {attendedToday.length === 0 ? (
            <EmptyState text="Chưa có học sinh nào điểm danh 'Đi học'." />
          ) : (
            <div className="space-y-2">
              {attendedToday.map(({ s, slot }) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {classChip(s.class_type)}
                      <span>⏰ {slot.start}–{slot.end}</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[color:var(--success)]">Đúng giờ ✓</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-[color:var(--warning)]" />Sắp hết hạn học phí</CardTitle>
            <CardDescription>Trong vòng 5 ngày tới</CardDescription>
          </div>
          <Button size="sm" onClick={() => mutExp.mutate()} disabled={mutExp.isPending}>
            {mutExp.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Gửi Telegram
          </Button>
        </CardHeader>
        <CardContent>
          {expiring.length === 0 ? (
            <EmptyState text="Không có học sinh nào sắp hết hạn." />
          ) : (
            <div className="space-y-2">
              {expiring.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      {classChip(s.class_type)}
                      <span>Hết hạn: {fmtDate(s.end_date)}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{Number(s.tuition).toLocaleString("vi-VN")}đ</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Gửi tin nhắn tùy chỉnh</CardTitle>
          <CardDescription>Soạn nội dung bất kỳ và gửi ngay vào nhóm Telegram.</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomTelegramForm />
        </CardContent>
      </Card>
    </div>
  );
}

function CustomTelegramForm() {
  const [text, setText] = useState("");
  const send = useServerFn(sendCustomTelegram);
  const mut = useMutation({
    mutationFn: () => send({ data: { text } }),
    onSuccess: () => { toast.success("Đã gửi tin nhắn"); setText(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3">
      <Textarea rows={4} placeholder="Nhập nội dung tin nhắn..." value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex justify-end">
        <Button onClick={() => text.trim() ? mut.mutate() : toast.error("Vui lòng nhập nội dung")} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Gửi Telegram
        </Button>
      </div>
    </div>
  );
}
