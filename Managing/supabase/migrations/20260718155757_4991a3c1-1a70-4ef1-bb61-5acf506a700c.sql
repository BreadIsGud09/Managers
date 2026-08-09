ALTER TYPE student_status ADD VALUE IF NOT EXISTS 'Kết thúc';
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS course_index integer NOT NULL DEFAULT 1;