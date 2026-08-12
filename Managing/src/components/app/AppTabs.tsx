import { lazy, Suspense, useState } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Coins,
  Loader2,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Each feature is downloaded only when its tab is first opened. This keeps the
// large feature screens independent without changing their mount/unmount model.
const StudentsTab = lazy(() => import("@/components/tabs/StudentsTab").then((module) => ({ default: module.StudentsTab })));
const ScheduleTab = lazy(() => import("@/components/tabs/ScheduleTab").then((module) => ({ default: module.ScheduleTab })));
const AttendanceTab = lazy(() => import("@/components/tabs/AttendanceTab").then((module) => ({ default: module.AttendanceTab })));
const LearningTab = lazy(() => import("@/components/tabs/LearningTab").then((module) => ({ default: module.LearningTab })));
const TuitionTab = lazy(() => import("@/components/tabs/TuitionTab").then((module) => ({ default: module.TuitionTab })));
const FinanceTab = lazy(() => import("@/components/tabs/FinanceTab").then((module) => ({ default: module.FinanceTab })));
const NotificationsTab = lazy(() =>
  import("@/components/tabs/NotificationsTab").then((module) => ({ default: module.NotificationsTab })),
);
const TelegramSettingsTab = lazy(() =>
  import("@/components/settings/TelegramSettingsTab").then((module) => ({ default: module.TelegramSettingsTab })),
);

const APP_TABS = [
  { value: "students", label: "Học sinh", Icon: Users, Content: StudentsTab },
  { value: "schedule", label: "Lịch học", Icon: CalendarDays, Content: ScheduleTab },
  { value: "attendance", label: "Điểm danh", Icon: ClipboardCheck, Content: AttendanceTab },
  { value: "learning", label: "Nhật ký học tập", Icon: BookOpen, Content: LearningTab },
  { value: "tuition", label: "Học phí", Icon: Wallet, Content: TuitionTab },
  { value: "finance", label: "Tài chính", Icon: Coins, Content: FinanceTab },
  { value: "notifications", label: "Thông báo", Icon: Bell, Content: NotificationsTab },
  { value: "settings", label: "Cài đặt", Icon: Settings, Content: TelegramSettingsTab },
] as const;

function FeatureLoadingState() {
  return (
    <div className="flex min-h-40 items-center justify-center text-muted-foreground" role="status">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
      <span>Đang tải…</span>
    </div>
  );
}

/** Keeps desktop tabs and the mobile select synchronized through one value. */
export function AppTabs() {
  const [activeTab, setActiveTab] = useState("students");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <div className="sm:hidden">
        <Select value={activeTab} onValueChange={setActiveTab}>
          <SelectTrigger className="w-full" aria-label="Chọn chức năng">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APP_TABS.map(({ value, label, Icon }) => (
              <SelectItem key={value} value={value}>
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TabsList className="hidden w-full sm:grid sm:grid-cols-4 lg:grid-cols-8">
        {APP_TABS.map(({ value, label, Icon }) => (
          <TabsTrigger key={value} value={value}>
            <Icon className="mr-1 h-4 w-4" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {APP_TABS.map(({ value, Content }) => (
        <TabsContent key={value} value={value}>
          <Suspense fallback={<FeatureLoadingState />}>
            <Content />
          </Suspense>
        </TabsContent>
      ))}
    </Tabs>
  );
}
