
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS total_sessions integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS schedule_days integer[] NOT NULL DEFAULT '{}'::int[],
  ADD COLUMN IF NOT EXISTS sessions_per_day integer NOT NULL DEFAULT 1;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_sessions_per_day_check;
ALTER TABLE public.students
  ADD CONSTRAINT students_sessions_per_day_check CHECK (sessions_per_day IN (1, 2));

-- Đặt mặc định tổng số buổi theo lớp cho dữ liệu hiện có
UPDATE public.students SET total_sessions = 48 WHERE class_type = 'Piano' AND total_sessions = 24;
