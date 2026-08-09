ALTER TYPE public.student_status ADD VALUE IF NOT EXISTS 'Hoàn thành';
ALTER TABLE public.finance_entries ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE public.finance_entries ADD COLUMN IF NOT EXISTS unit_amount numeric NOT NULL DEFAULT 0;