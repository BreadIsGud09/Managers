import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast, Toaster } from "sonner";
import { GraduationCap, Users, CalendarDays, ClipboardCheck, Bell, Settings as SettingsIcon, Wallet, Loader2, Send, BookOpen, Coins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { StudentsTab } from "@/components/tabs/StudentsTab";
import { ScheduleTab } from "@/components/tabs/ScheduleTab";
import { AttendanceTab } from "@/components/tabs/AttendanceTab";
import { TuitionTab } from "@/components/tabs/TuitionTab";
import { NotificationsTab } from "@/components/tabs/NotificationsTab";
import { LearningTab } from "@/components/tabs/LearningTab";
import { FinanceTab } from "@/components/tabs/FinanceTab";

import { getTelegramStatus, saveTelegramConfig, sendCustomTelegram } from "@/lib/telegram.functions";

export const Route = createFileRoute("/")({
  component: App,
  head: () => ({
    meta: [
      { title: "Quản lý học sinh — Piano · Múa · Vẽ" },
      { name: "description", content: "Quản lý học sinh, thời khóa biểu, điểm danh, học phí, nhật ký học tập và tài chính cho trung tâm Piano, Múa, Vẽ." },
      { property: "og:title", content: "Quản lý học sinh — Piano · Múa · Vẽ" },
      { property: "og:description", content: "Quản lý học sinh, điểm danh, học phí và tài chính trung tâm nghệ thuật." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TABS = [
  { value: "students", label: "Học sinh", Icon: Users },
  { value: "schedule", label: "Lịch học", Icon: CalendarDays },
  { value: "attendance", label: "Điểm danh", Icon: ClipboardCheck },
  { value: "learning", label: "Nhật ký học tập", Icon: BookOpen },
  { value: "tuition", label: "Học phí", Icon: Wallet },
  { value: "finance", label: "Tài chính", Icon: Coins },
  { value: "notifications", label: "Thông báo", Icon: Bell },
  { value: "settings", label: "Cài đặt", Icon: SettingsIcon },
] as const;

function App() {
  const [tab, setTab] = useState<string>("students");
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <Toaster position="top-right" richColors />
      <header className="border-b bg-card/80 backdrop-blur">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold sm:text-xl">Quản lý học sinh</h1>
            <p className="text-xs text-muted-foreground">Piano · Múa · Vẽ</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-2 py-6 sm:px-4">
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          {/* Mobile: dropdown gọn */}
          <div className="sm:hidden">
            <Select value={tab} onValueChange={setTab}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TABS.map(({ value, label, Icon }) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tablet/Desktop */}
          <TabsList className="hidden w-full sm:grid sm:grid-cols-4 lg:grid-cols-8">
            {TABS.map(({ value, label, Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon className="mr-1 h-4 w-4" />
                <span className="truncate">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="students"><StudentsTab /></TabsContent>
          <TabsContent value="schedule"><ScheduleTab /></TabsContent>
          <TabsContent value="attendance"><AttendanceTab /></TabsContent>
          <TabsContent value="learning"><LearningTab /></TabsContent>
          <TabsContent value="tuition"><TuitionTab /></TabsContent>
          <TabsContent value="finance"><FinanceTab /></TabsContent>
          <TabsContent value="notifications"><NotificationsTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function SettingsTab() {
  const fetchStatus = useServerFn(getTelegramStatus);
  const save = useServerFn(saveTelegramConfig);
  const sendTest = useServerFn(sendCustomTelegram);
  const qc = useQueryClient();
  const { data } = useQuery<{ configured: boolean; chat_id: string | null }>({ queryKey: ["tg-status"], queryFn: () => fetchStatus() as any });

  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  useEffect(() => { if (data?.chat_id) setChatId(data.chat_id); }, [data?.chat_id]);

  const mut = useMutation({
    mutationFn: () => save({ data: { bot_token: botToken || null, chat_id: chatId || null } as any }),
    onSuccess: () => { toast.success("Đã lưu cấu hình Telegram"); qc.invalidateQueries({ queryKey: ["tg-status"] }); setBotToken(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  const test = useMutation({
    mutationFn: () => sendTest({ data: { text: "🔔 Test kết nối Telegram từ hệ thống Quản lý học sinh." } }),
    onSuccess: () => toast.success("Đã gửi tin nhắn thử"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-card max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><SettingsIcon className="h-5 w-5 text-primary" />Cấu hình Telegram</CardTitle>
        <CardDescription>
          Trạng thái: {data?.configured ? <span className="font-semibold text-[color:var(--success)]">Đã cấu hình</span> : <span className="text-muted-foreground">Chưa cấu hình</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1">
          <Label>Bot Token</Label>
          <Input type="password" placeholder={data?.configured ? "•••••••••• (để trống nếu không đổi)" : "123456:ABC-..."} value={botToken} onChange={(e) => setBotToken(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label>Chat ID nhóm</Label>
          <Input placeholder="-1001234567890" value={chatId} onChange={(e) => setChatId(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Lưu cấu hình
          </Button>
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !data?.configured}>
            {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Gửi thử
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
