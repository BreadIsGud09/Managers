import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listPayments = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await (sb as any).from("tuition_payments").select("*").order("month", { ascending: false }).order("paid_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

const PaymentInput = z.object({
  id: z.string().uuid().optional(),
  student_id: z.string().uuid(),
  month: z.string(), // YYYY-MM or YYYY-MM-DD
  amount: z.number().min(0),
  paid_date: z.string(),
  ky_index: z.number().int().min(1).default(1),
  note: z.string().max(300).nullable().optional(),
});

function normalizeMonth(m: string) {
  // Accept YYYY-MM or YYYY-MM-DD → return YYYY-MM-01
  if (/^\d{4}-\d{2}$/.test(m)) return m + "-01";
  return m.slice(0, 7) + "-01";
}

export const upsertPayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PaymentInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const payload = { ...data, month: normalizeMonth(data.month), note: data.note ?? null };
    if (data.id) {
      const { error } = await (sb as any).from("tuition_payments").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { id: _i, ...ins } = payload;
      const { error } = await (sb as any).from("tuition_payments").insert(ins);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deletePayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await (sb as any).from("tuition_payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
