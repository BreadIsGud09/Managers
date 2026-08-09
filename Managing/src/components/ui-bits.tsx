import { Music, Palette, Sparkles } from "lucide-react";
import type { ClassType, StudentStatus } from "@/lib/shared";
import { Badge } from "@/components/ui/badge";

export function classIcon(c: ClassType) {
  if (c === "Piano") return <Music className="h-4 w-4" />;
  if (c === "Múa") return <Sparkles className="h-4 w-4" />;
  return <Palette className="h-4 w-4" />;
}

export function classChip(c: ClassType) {
  const styles: Record<ClassType, string> = {
    Piano: "bg-piano text-piano-foreground",
    "Múa": "bg-mua text-mua-foreground",
    "Vẽ": "bg-ve text-ve-foreground",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[c]}`}>
      {classIcon(c)} {c}
    </span>
  );
}

export function statusBadge(s: StudentStatus) {
  const map: Record<StudentStatus, string> = {
    "Đang học": "bg-success/15 text-[color:var(--success)] border-[color:var(--success)]/30",
    "Bảo lưu": "bg-primary/10 text-primary border-primary/30",
    "Hoàn thành": "bg-muted text-muted-foreground border-border",
    "Chuẩn bị": "bg-warning/15 text-[color:var(--warning)] border-[color:var(--warning)]/30",
  };
  return <Badge variant="outline" className={map[s]}>{s}</Badge>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">{text}</div>;
}
