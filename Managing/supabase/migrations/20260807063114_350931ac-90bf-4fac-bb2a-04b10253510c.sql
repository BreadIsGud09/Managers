CREATE TABLE public.people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  age integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.people TO service_role;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.students ADD COLUMN person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;

INSERT INTO public.people (name, age)
SELECT DISTINCT ON (lower(btrim(name)), age) btrim(name), age
FROM public.students
ORDER BY lower(btrim(name)), age, created_at;

UPDATE public.students s
SET person_id = p.id
FROM public.people p
WHERE lower(btrim(s.name)) = lower(btrim(p.name)) AND s.age = p.age;

CREATE INDEX idx_students_person_id ON public.students(person_id);

CREATE TABLE public.schedule_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  old_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.schedule_changes TO service_role;
ALTER TABLE public.schedule_changes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_schedule_changes_student ON public.schedule_changes(student_id, effective_from);