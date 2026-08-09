
-- 1) schedule_slots for students: array of {day:int, start:"HH:MM", end:"HH:MM"}
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS schedule_slots jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) attendance: note + makeup_date + unique key so upsert(on_conflict) works
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS makeup_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_student_date_unique'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_student_date_unique UNIQUE (student_id, date);
  END IF;
END $$;

-- 3) tuition_payments
CREATE TABLE IF NOT EXISTS public.tuition_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  month date NOT NULL,           -- always day=1 of the target month
  amount numeric NOT NULL DEFAULT 0,
  paid_date date NOT NULL DEFAULT CURRENT_DATE,
  ky_index integer NOT NULL DEFAULT 1,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.tuition_payments TO service_role;
ALTER TABLE public.tuition_payments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_tuition_payments_updated_at ON public.tuition_payments;
CREATE TRIGGER trg_tuition_payments_updated_at
BEFORE UPDATE ON public.tuition_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_tuition_payments_month ON public.tuition_payments(month);
CREATE INDEX IF NOT EXISTS idx_tuition_payments_student ON public.tuition_payments(student_id);
