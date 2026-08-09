ALTER TABLE public.finance_entries
  ADD COLUMN IF NOT EXISTS class_type text,
  ADD COLUMN IF NOT EXISTS income_type text,
  ADD COLUMN IF NOT EXISTS student_name text,
  ADD COLUMN IF NOT EXISTS course_label text,
  ADD COLUMN IF NOT EXISTS term_start date,
  ADD COLUMN IF NOT EXISTS term_end date,
  ADD COLUMN IF NOT EXISTS paid_date date;