// Client-callable RPC definitions; privileged modules are loaded inside handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { NumericIdSchema, numericId } from "@/Shared/Constraints";

async function adminDatabase() {
  const { getAdminDatabase } = await import("@/server/database/supabase-admin.server");
  return getAdminDatabase();
}

const PaymentInputSchema = z.object({
  id: NumericIdSchema.optional(),
  student_id: NumericIdSchema,
  month: z.string(),
  amount: z.number().positive(),  
  paid_date: z.string(),
  ky_index: z.number().int().min(1).default(1),
  note: z.string().max(300).nullable().optional(),
});

function normalizeMonth(value: string): string {
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : `${value.slice(0, 7)}-01`;
}

async function tuitionCategoryId(): Promise<number> {
  const db = await adminDatabase();
  const { data: found, error: findError } = await db
    .from("income_categories")
    .select("income_category_id")
    .eq("category_name", "Học phí")
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (found) return found.income_category_id;

  const { data, error } = await db
    .from("income_categories")
    .insert({ category_name: "Học phí" })
    .select("income_category_id")
    .single();
  if (error) throw new Error(error.message);
  return data.income_category_id;
}

export const listPayments = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDatabase();
  const { data, error } = await db
    .from("income_transactions")
    .select("income_id,enrollment_id,billing_month,amount,paid_date,installment_index,description")
    .eq("entry_origin", "tuition_payment")
    .order("billing_month", { ascending: false })
    .order("paid_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.income_id),
    student_id: String(row.enrollment_id),
    month: row.billing_month ?? row.paid_date ?? "",
    amount: Number(row.amount),
    paid_date: row.paid_date ?? "",
    ky_index: row.installment_index ?? 1,
    note: row.description,
  }));
});

export const upsertPayment = createServerFn({ method: "POST" })
  .validator((value: unknown) => PaymentInputSchema.parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const enrollmentId = numericId(data.student_id);
    const { data: enrollment, error: enrollmentError } = await db
      .from("enrollments")
      .select("class_id")
      .eq("enrollment_id", enrollmentId)
      .single();
    if (enrollmentError) throw new Error(enrollmentError.message);

    const payload = {
      income_category_id: await tuitionCategoryId(),
      enrollment_id: enrollmentId,
      class_id: enrollment.class_id,
      amount: data.amount,
      billing_month: normalizeMonth(data.month),
      due_date: null,
      paid_date: data.paid_date,
      description: data.note ?? null,
      status: "Paid",
      income_type: "tuition",
      entry_origin: "tuition_payment",
      installment_index: data.ky_index,
    };
    if (data.id) {
      const { error } = await db
        .from("income_transactions")
        .update(payload)
        .eq("income_id", numericId(data.id));
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("income_transactions").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deletePayment = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ id: NumericIdSchema }).parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const { error } = await db
      .from("income_transactions")
      .delete()
      .eq("income_id", numericId(data.id))
      .eq("entry_origin", "tuition_payment");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
