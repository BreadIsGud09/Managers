import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Toaster } from "sonner";

import { AppTabs } from "@/components/app/AppTabs";

export const Route = createFileRoute("/")({
  component: App,
  head: () => ({
    meta: [
      { title: "Quản lý học sinh — Piano · Múa · Vẽ" },
      {
        name: "description",
        content:
          "Quản lý học sinh, thời khóa biểu, điểm danh, học phí, nhật ký học tập và tài chính cho trung tâm Piano, Múa, Vẽ.",
      },
      { property: "og:title", content: "Quản lý học sinh — Piano · Múa · Vẽ" },
      {
        property: "og:description",
        content: "Quản lý học sinh, điểm danh, học phí và tài chính trung tâm nghệ thuật.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/**
 * The route owns document metadata and the page shell only. Feature navigation
 * and feature data flows live below AppTabs so this file stays easy to scan.
 */
function App() {
  return (
    <div className="min-h-screen bg-linear-to-br from-background via-background to-muted/30">
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
        <AppTabs />
      </main>
    </div>
  );
}
