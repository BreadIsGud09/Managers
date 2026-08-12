// Client-callable RPC definitions; privileged modules are loaded inside handlers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ClassTypeSchema } from "@/Shared/Constraints";

async function managerData() {
  return import("@/server/database/manager-data.server");
}

async function adminDatabase() {
  const { getAdminDatabase } = await import("@/server/database/supabase-admin.server");
  return getAdminDatabase();
}

const FinanceKindSchema = z.enum(["thu", "chi"]);
const IncomeTypeSchema = z.enum(["hoc_phi", "khac"]);
const FinanceIdSchema = z.string().regex(/^(income|expense):\d+$/);

function normalizeMonth(value: string): string {
  return /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : `${value.slice(0, 7)}-01`;
}

function parseFinanceId(value: string): { kind: "income" | "expense"; id: number } {
  const [kind, rawId] = FinanceIdSchema.parse(value).split(":") as ["income" | "expense", string];
  return { kind, id: Number(rawId) };
}

async function findOrCreateIncomeCategory(name: string): Promise<number> {
  const db = await adminDatabase();
  const { data: found, error: findError } = await db
    .from("income_categories")
    .select("income_category_id")
    .eq("category_name", name)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (found) return found.income_category_id;

  const { data, error } = await db
    .from("income_categories")
    .insert({ category_name: name })
    .select("income_category_id")
    .single();
  if (error) throw new Error(error.message);
  return data.income_category_id;
}

async function findOrCreateExpenseCategory(name: string): Promise<number> {
  const db = await adminDatabase();
  const { data: found, error: findError } = await db
    .from("expense_categories")
    .select("expense_category_id")
    .eq("category_name", name)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (found) return found.expense_category_id;

  const { data, error } = await db
    .from("expense_categories")
    .insert({ category_name: name, default_amount: 0, sort_order: 999, active: true })
    .select("expense_category_id")
    .single();
  if (error) throw new Error(error.message);
  return data.expense_category_id;
}

export const listExpenseCategories = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDatabase();
  const { data, error } = await db.from("expense_categories").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.expense_category_id),
    name: row.category_name,
    default_amount: Number(row.default_amount),
    sort_order: row.sort_order,
    active: row.active,
  }));
});

export const listFinanceEntries = createServerFn({ method: "GET" }).handler(async () => {
  const db = await adminDatabase();
  const [incomeResult, expenseResult, incomeCategoriesResult, expenseCategoriesResult, classesResult] =
    await Promise.all([
      db
        .from("income_transactions")
        .select("*")
        .eq("entry_origin", "manual_finance")
        .order("billing_month", { ascending: false })
        .order("created_at", { ascending: false }),
      db
        .from("expense_transactions")
        .select("*")
        .order("expense_month", { ascending: false })
        .order("created_at", { ascending: false }),
      db.from("income_categories").select("*"),
      db.from("expense_categories").select("expense_category_id,category_name"),
      db.from("classes").select("class_id,class_name,subject"),
    ]);
  const error = [incomeResult, expenseResult, incomeCategoriesResult, expenseCategoriesResult, classesResult]
    .map((result) => result.error)
    .find(Boolean);
  if (error) throw new Error(error.message);

  const incomeCategoryById = new Map(
    (incomeCategoriesResult.data ?? []).map((row) => [row.income_category_id, row.category_name]),
  );
  const expenseCategoryById = new Map(
    (expenseCategoriesResult.data ?? []).map((row) => [row.expense_category_id, row.category_name]),
  );
  const classById = new Map(
    (classesResult.data ?? []).map((row) => [row.class_id, row.subject || row.class_name]),
  );

  const income = (incomeResult.data ?? []).map((row) => ({
    id: `income:${row.income_id}`,
    month: row.billing_month ?? row.paid_date ?? row.created_at.slice(0, 10),
    kind: "thu" as const,
    category: incomeCategoryById.get(row.income_category_id) ?? "Thu khác",
    amount: Number(row.amount),
    note: row.description,
    is_fixed: false,
    class_type: row.class_id ? classById.get(row.class_id) ?? null : null,
    income_type: row.income_type === "tuition" ? ("hoc_phi" as const) : ("khac" as const),
    student_name: row.student_name,
    course_label: row.course_label,
    term_start: row.term_start,
    term_end: row.term_end,
    paid_date: row.paid_date,
    quantity: row.quantity,
    unit_amount: row.unit_amount,
  }));

  const expenses = (expenseResult.data ?? []).map((row) => ({
    id: `expense:${row.expense_id}`,
    month: row.expense_month ?? row.incurred_date,
    kind: "chi" as const,
    category: expenseCategoryById.get(row.expense_category_id) ?? "Chi khác",
    amount: Number(row.amount),
    note: row.description,
    is_fixed: row.is_fixed,
    class_type: row.class_id ? classById.get(row.class_id) ?? null : null,
    income_type: null,
    student_name: null,
    course_label: null,
    term_start: null,
    term_end: null,
    paid_date: row.paid_date,
    quantity: row.quantity,
    unit_amount: row.unit_amount,
  }));

  return [...income, ...expenses].sort(
    (a, b) => b.month.localeCompare(a.month) || b.id.localeCompare(a.id),
  );
});

const EntryInputSchema = z.object({
  id: FinanceIdSchema.optional(),
  month: z.string(),
  kind: FinanceKindSchema,
  category: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  note: z.string().max(500).nullable().optional(),
  is_fixed: z.boolean().default(false),
  quantity: z.number().int().min(1).default(1),
  unit_amount: z.number().min(0).default(0),
  class_type: ClassTypeSchema.nullable().optional(),
  income_type: IncomeTypeSchema.nullable().optional(),
  student_name: z.string().max(120).nullable().optional(),
  course_label: z.string().max(30).nullable().optional(),
  term_start: z.string().nullable().optional(),
  term_end: z.string().nullable().optional(),
  paid_date: z.string().nullable().optional(),
});

export const upsertFinanceEntry = createServerFn({ method: "POST" })
  .validator((value: unknown) => EntryInputSchema.parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const existing = data.id ? parseFinanceId(data.id) : null;
    const targetKind = data.kind === "thu" ? "income" : "expense";
    if (existing && existing.kind !== targetKind) {
      const { error } = existing.kind === "income"
        ? await db.from("income_transactions").delete().eq("income_id", existing.id)
        : await db.from("expense_transactions").delete().eq("expense_id", existing.id);
      if (error) throw new Error(error.message);
    }

    const classId = data.class_type
      ? (await (await managerData()).findClassByType(data.class_type)).class_id
      : null;
    const month = normalizeMonth(data.month);
    if (data.kind === "thu") {
      const categoryId = await findOrCreateIncomeCategory(data.category);
      const payload = {
        income_category_id: categoryId,
        enrollment_id: null,
        class_id: classId,
        amount: data.amount,
        billing_month: month,
        due_date: null,
        paid_date: data.paid_date || null,
        description: data.note ?? null,
        status: data.paid_date ? "Paid" : "Due",
        income_type: data.income_type === "hoc_phi" ? "tuition" : "other",
        student_name: data.student_name ?? null,
        course_label: data.course_label ?? null,
        term_start: data.term_start || null,
        term_end: data.term_end || null,
        quantity: data.quantity,
        unit_amount: data.unit_amount,
        entry_origin: "manual_finance",
        installment_index: null,
      };
      if (existing?.kind === "income") {
        const { error } = await db.from("income_transactions").update(payload).eq("income_id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from("income_transactions").insert(payload);
        if (error) throw new Error(error.message);
      }
    } else {
      const categoryId = await findOrCreateExpenseCategory(data.category);
      const payload = {
        expense_category_id: categoryId,
        teacher_id: null,
        class_id: classId,
        expense_month: month,
        amount: data.amount,
        incurred_date: month,
        due_date: null,
        paid_date: data.paid_date || null,
        description: data.note ?? null,
        status: data.paid_date ? "Paid" : "Due",
        is_fixed: data.is_fixed,
        quantity: data.quantity,
        unit_amount: data.unit_amount,
      };
      if (existing?.kind === "expense") {
        const { error } = await db.from("expense_transactions").update(payload).eq("expense_id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await db.from("expense_transactions").insert(payload);
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });

export const deleteFinanceEntry = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ id: FinanceIdSchema }).parse(value))
  .handler(async ({ data }) => {
    const db = await adminDatabase();
    const parsed = parseFinanceId(data.id);
    const { error } = parsed.kind === "income"
      ? await db.from("income_transactions").delete().eq("income_id", parsed.id)
      : await db.from("expense_transactions").delete().eq("expense_id", parsed.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
