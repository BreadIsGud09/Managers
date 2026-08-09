
-- Enum lớp học và trạng thái
CREATE TYPE public.class_type AS ENUM ('Piano', 'Múa', 'Vẽ');
CREATE TYPE public.student_status AS ENUM ('Đang học', 'Nghỉ phép', 'Bảo lưu');
CREATE TYPE public.attendance_status AS ENUM ('Đi học', 'Nghỉ có phép', 'Nghỉ không phép');

-- Bảng học sinh
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age > 0 AND age < 120),
  class_type public.class_type NOT NULL,
  tuition NUMERIC(12,0) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status public.student_status NOT NULL DEFAULT 'Đang học',
  reserve_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO anon, authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access students" ON public.students FOR ALL USING (true) WITH CHECK (true);

-- Bảng điểm danh
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status public.attendance_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO anon, authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access attendance" ON public.attendance FOR ALL USING (true) WITH CHECK (true);

-- Bảng lịch học tuần
CREATE TABLE public.class_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_type public.class_type NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=CN,1=T2,...
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_schedule TO anon, authenticated;
GRANT ALL ON public.class_schedule TO service_role;
ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access schedule" ON public.class_schedule FOR ALL USING (true) WITH CHECK (true);

-- Bảng cấu hình Telegram - chỉ service_role đọc/ghi (token nhạy cảm)
CREATE TABLE public.telegram_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bot_token TEXT,
  chat_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_settings TO service_role;
ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated - only service_role can access

INSERT INTO public.telegram_settings (id, bot_token, chat_id) VALUES (1, NULL, NULL);

-- Trigger cập nhật updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER students_updated BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Trigger: khi chuyển sang 'Bảo lưu', cộng reserve_days vào end_date
CREATE OR REPLACE FUNCTION public.apply_reserve_extension()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'Bảo lưu' AND (OLD.status IS DISTINCT FROM 'Bảo lưu' OR OLD.reserve_days IS DISTINCT FROM NEW.reserve_days) THEN
    IF NEW.reserve_days > 0 THEN
      NEW.end_date := NEW.end_date + (NEW.reserve_days - COALESCE(OLD.reserve_days,0)) * INTERVAL '1 day';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER students_reserve BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.apply_reserve_extension();

-- Seed lịch học mẫu
INSERT INTO public.class_schedule (class_type, day_of_week, start_time, end_time, location) VALUES
  ('Piano', 1, '18:00', '19:30', 'Phòng 101'),
  ('Piano', 4, '18:00', '19:30', 'Phòng 101'),
  ('Múa', 2, '17:00', '18:30', 'Phòng 202'),
  ('Múa', 5, '17:00', '18:30', 'Phòng 202'),
  ('Vẽ', 3, '15:00', '16:30', 'Phòng 303'),
  ('Vẽ', 6, '09:00', '10:30', 'Phòng 303');
