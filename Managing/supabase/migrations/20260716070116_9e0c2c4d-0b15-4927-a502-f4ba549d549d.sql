
DROP POLICY IF EXISTS "Public access attendance" ON public.attendance;
DROP POLICY IF EXISTS "Public access schedule" ON public.class_schedule;
DROP POLICY IF EXISTS "Public access students" ON public.students;

REVOKE ALL ON public.attendance FROM anon, authenticated;
REVOKE ALL ON public.class_schedule FROM anon, authenticated;
REVOKE ALL ON public.students FROM anon, authenticated;

GRANT ALL ON public.attendance TO service_role;
GRANT ALL ON public.class_schedule TO service_role;
GRANT ALL ON public.students TO service_role;

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
