// Client-callable RPC definitions; privileged modules are loaded inside handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { LearningLog } from "@/Shared/shared";
import {
  ClassTypeSchema,
  NumericIdSchema,
  numericId,
} from "@/Shared/Constraints";

async function managerData() {
  return import("@/server/database/manager-data.server");
}

async function adminDatabase() {
  const { getAdminDatabase } = await import("@/server/database/supabase-admin.server");
  return getAdminDatabase();
}

const AttachmentSchema = z.object({
  kind: z.enum(["image", "video", "link"]),
  url: z.string().min(1).max(2000),
  label: z.string().max(200).nullable().optional(),
});

const LogInputSchema = z.object({
  id: NumericIdSchema.optional(),
  student_id: NumericIdSchema.nullable().optional(),
  class_type: ClassTypeSchema,
  date: z.string(),
  title: z.string().trim().min(1).max(300),
  content: z.string().max(5000).nullable().optional(),
  attachments: z.array(AttachmentSchema).default([]),
  is_class_wide: z.boolean().default(false),
});

export const listLearningLogs = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDatabase();
  const [logsResult, classesResult] = await Promise.all([
    db.from("learning_logs").select("*").order("log_date", { ascending: false }).order("created_at", { ascending: false }),
    db.from("classes").select("class_id,class_name,subject"),
  ]);
  if (logsResult.error) throw new Error(logsResult.error.message);
  if (classesResult.error) throw new Error(classesResult.error.message);
  const classById = new Map(
    (classesResult.data ?? []).map((row) => [row.class_id, row.subject || row.class_name]),
  );

  return (logsResult.data ?? []).map(
    (row): LearningLog => ({
      id: String(row.learning_log_id),
      student_id: row.enrollment_id === null ? null : String(row.enrollment_id),
      class_type: ClassTypeSchema.parse(classById.get(row.class_id)),
      date: row.log_date,
      title: row.title,
      content: row.content,
      attachments: z.array(AttachmentSchema).parse(row.attachments),
      is_class_wide: row.is_class_wide,
    }),
  );
});

export const upsertLearningLog = createServerFn({ method: "POST" })
  .validator((value: unknown) => LogInputSchema.parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const classRow = await (await managerData()).findClassByType(data.class_type);
    const payload = {
      enrollment_id: data.is_class_wide ? null : numericId(data.student_id ?? ""),
      class_id: classRow.class_id,
      log_date: data.date,
      title: data.title,
      content: data.content ?? null,
      attachments: data.attachments,
      is_class_wide: data.is_class_wide,
    };
    if (data.id) {
      const { error } = await db
        .from("learning_logs")
        .update(payload)
        .eq("learning_log_id", numericId(data.id));
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("learning_logs").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteLearningLog = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ id: NumericIdSchema }).parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { error } = await db
      .from("learning_logs")
      .delete()
      .eq("learning_log_id", numericId(data.id));
    if (error) throw new Error(error.message);
    return { ok: true };
  });
