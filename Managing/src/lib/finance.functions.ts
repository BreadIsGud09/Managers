import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function normalizeMonth(m: string) {
  if (/^\d{4}-\d{2}$/.test(m)) return m + "-01";
  return m.slice(0, 7) + "-01";
}

export const listExpenseCategories = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await (sb as any).from("expense_categories").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listFinanceEntries = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  if (!sb) throw new Error("Supabase admin client not available");

  
  const { data, error } = await (sb as any)
    .from("finance_entries")
    .select("*")
    .order("month", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const EntryInput = z.object({
  id: z.string().uuid().optional(),
  month: z.string(),
  kind: z.enum(["thu", "chi"]),
  category: z.string().trim().min(1).max(200),
  amount: z.number().min(0),
  note: z.string().max(500).nullable().optional(),
  is_fixed: z.boolean().default(false),
  quantity: z.number().int().min(1).default(1),
  unit_amount: z.number().min(0).default(0),

  class_type: z.string().max(20).nullable().optional(),
  income_type: z.enum(["hoc_phi", "khac"]).nullable().optional(),
  student_name: z.string().max(120).nullable().optional(),
  course_label: z.string().max(30).nullable().optional(),
  term_start: z.string().nullable().optional(),
  term_end: z.string().nullable().optional(),
  paid_date: z.string().nullable().optional(),
});

export const upsertFinanceEntry = createServerFn({ method: "POST" })
  .validator((d: unknown) => EntryInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const payload = {
      ...data,
      month: normalizeMonth(data.month),
      note: data.note ?? null,
      class_type: data.class_type ?? null,
      income_type: data.income_type ?? null,
      student_name: data.student_name ?? null,
      course_label: data.course_label ?? null,
      term_start: data.term_start || null,
      term_end: data.term_end || null,
      paid_date: data.paid_date || null,
    };
    if (data.id) {
      const { error } = await (sb as any).from("finance_entries").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { id: _i, ...ins } = payload;
      const { error } = await (sb as any).from("finance_entries").insert(ins);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteFinanceEntry = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await (sb as any).from("finance_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
