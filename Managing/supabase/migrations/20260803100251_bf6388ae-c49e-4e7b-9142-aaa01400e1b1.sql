CREATE TABLE public.learning_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  class_type class_type NOT NULL,
  date date NOT NULL,
  title text NOT NULL DEFAULT '',
  content text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_class_wide boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.learning_logs TO service_role;
ALTER TABLE public.learning_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_learning_logs_student_date ON public.learning_logs(student_id, date);
CREATE INDEX idx_learning_logs_class_date ON public.learning_logs(class_type, date);
CREATE TRIGGER trg_learning_logs_updated_at BEFORE UPDATE ON public.learning_logs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  default_amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('thu','chi')),
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  is_fixed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.finance_entries TO service_role;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_finance_entries_month ON public.finance_entries(month);
CREATE TRIGGER trg_finance_entries_updated_at BEFORE UPDATE ON public.finance_entries FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.expense_categories (name, default_amount, sort_order) VALUES
  ('Lương giáo viên', 0, 1),
  ('Tiền mặt bằng', 0, 2),
  ('Tiền điện', 0, 3),
  ('Tiền nước', 0, 4),
  ('Tiền thuế', 0, 5);