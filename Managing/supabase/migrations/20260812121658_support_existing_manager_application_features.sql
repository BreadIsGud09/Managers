-- Canonical normalized Manager schema plus the compatibility fields required
-- by the current application. The live target already had the first 13 tables;
-- IF NOT EXISTS keeps this migration usable for a clean local database too.

create table if not exists public.parents (
  parent_id bigint generated always as identity primary key,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone_number text not null
);

create table if not exists public.students (
  student_id bigint generated always as identity primary key,
  parent_id bigint not null references public.parents(parent_id),
  first_name text not null,
  last_name text not null,
  aka text
);

create table if not exists public.salary_rates (
  salary_rate_id bigint generated always as identity primary key,
  rate_name text not null unique,
  monthly_salary numeric(19,2) not null check (monthly_salary >= 0)
);

create table if not exists public.teachers (
  teacher_id bigint generated always as identity primary key,
  salary_rate_id bigint not null references public.salary_rates(salary_rate_id),
  first_name text not null,
  last_name text not null
);

create table if not exists public.classes (
  class_id bigint generated always as identity primary key,
  teacher_id bigint not null references public.teachers(teacher_id),
  class_name text not null,
  subject text,
  about text,
  fee numeric(19,2) not null check (fee >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  prerequisite text
);

create table if not exists public.class_levels (
  class_level_id bigint generated always as identity primary key,
  class_id bigint not null references public.classes(class_id),
  level text not null,
  requirement text,
  unique (class_id, level),
  unique (class_level_id, class_id)
);

create table if not exists public.class_schedules (
  schedule_id bigint generated always as identity primary key,
  class_id bigint not null references public.classes(class_id),
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  student_capacity smallint not null check (student_capacity between 1 and 20),
  is_active boolean not null default true,
  unique (class_id, day_of_week, start_time, end_time),
  unique (schedule_id, class_id),
  check (start_time < end_time)
);

create table if not exists public.enrollments (
  enrollment_id bigint generated always as identity primary key,
  student_id bigint not null references public.students(student_id),
  class_id bigint not null,
  class_level_id bigint not null,
  enroll_date date not null,
  ending_date date,
  status text not null check (status in ('PendingSchedule', 'Active', 'Completed', 'Cancelled')),
  agreed_fee numeric(19,2) not null check (agreed_fee >= 0),
  unique (enrollment_id, class_id),
  foreign key (class_level_id, class_id)
    references public.class_levels(class_level_id, class_id),
  check (ending_date is null or ending_date >= enroll_date)
);

create table if not exists public.enrollment_schedules (
  enrollment_id bigint not null,
  schedule_id bigint not null,
  class_id bigint not null,
  primary key (enrollment_id, schedule_id),
  foreign key (enrollment_id, class_id)
    references public.enrollments(enrollment_id, class_id) on delete cascade,
  foreign key (schedule_id, class_id)
    references public.class_schedules(schedule_id, class_id)
);

create table if not exists public.expense_categories (
  expense_category_id bigint generated always as identity primary key,
  category_name text not null unique
);

create table if not exists public.expense_transactions (
  expense_id bigint generated always as identity primary key,
  expense_category_id bigint not null references public.expense_categories(expense_category_id),
  teacher_id bigint references public.teachers(teacher_id),
  expense_month date,
  amount numeric(19,2) not null check (amount > 0),
  incurred_date date not null,
  due_date date,
  paid_date date,
  description text,
  status text not null check (status in ('Due', 'Paid', 'Overdue', 'Cancelled')),
  check ((status = 'Paid' and paid_date is not null) or (status <> 'Paid' and paid_date is null)),
  check (expense_month is null or expense_month = date_trunc('month', expense_month)::date)
);

create table if not exists public.income_categories (
  income_category_id bigint generated always as identity primary key,
  category_name text not null unique
);

create table if not exists public.income_transactions (
  income_id bigint generated always as identity primary key,
  income_category_id bigint not null references public.income_categories(income_category_id),
  enrollment_id bigint references public.enrollments(enrollment_id),
  amount numeric(19,2) not null check (amount > 0),
  billing_month date,
  due_date date,
  paid_date date,
  description text,
  status text not null check (status in ('Due', 'Paid', 'Overdue', 'Cancelled')),
  check ((status = 'Paid' and paid_date is not null) or (status <> 'Paid' and paid_date is null)),
  check (billing_month is null or billing_month = date_trunc('month', billing_month)::date)
);

alter table public.students
  add column if not exists age smallint not null default 0 check (age between 0 and 130),
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.class_schedules
  add column if not exists location text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.enrollments
  add column if not exists total_sessions integer not null default 1 check (total_sessions > 0),
  add column if not exists reserve_days integer not null default 0 check (reserve_days >= 0),
  add column if not exists status_detail text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.expense_categories
  add column if not exists default_amount numeric(14,2) not null default 0 check (default_amount >= 0),
  add column if not exists sort_order integer not null default 0,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.expense_transactions
  add column if not exists class_id bigint references public.classes(class_id) on delete set null,
  add column if not exists is_fixed boolean not null default false,
  add column if not exists quantity numeric(12,2),
  add column if not exists unit_amount numeric(14,2),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.income_transactions
  add column if not exists class_id bigint references public.classes(class_id) on delete set null,
  add column if not exists income_type text not null default 'other' check (income_type in ('tuition', 'other')),
  add column if not exists student_name text,
  add column if not exists course_label text,
  add column if not exists term_start date,
  add column if not exists term_end date,
  add column if not exists quantity numeric(12,2),
  add column if not exists unit_amount numeric(14,2),
  add column if not exists entry_origin text not null default 'manual_finance'
    check (entry_origin in ('manual_finance', 'tuition_payment')),
  add column if not exists installment_index integer check (installment_index is null or installment_index > 0),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.attendance_records (
  attendance_id bigint generated always as identity primary key,
  enrollment_id bigint not null references public.enrollments(enrollment_id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('Đi học', 'Nghỉ có phép', 'Nghỉ không phép', 'Bảo lưu')),
  note text,
  makeup_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, attendance_date)
);

create table if not exists public.learning_logs (
  learning_log_id bigint generated always as identity primary key,
  enrollment_id bigint references public.enrollments(enrollment_id) on delete cascade,
  class_id bigint not null references public.classes(class_id) on delete cascade,
  log_date date not null,
  title text not null,
  content text,
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  is_class_wide boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_class_wide and enrollment_id is null) or (not is_class_wide and enrollment_id is not null))
);

create table if not exists public.enrollment_schedule_changes (
  change_id bigint generated always as identity primary key,
  enrollment_id bigint not null references public.enrollments(enrollment_id) on delete cascade,
  effective_from date not null,
  old_slots jsonb not null check (jsonb_typeof(old_slots) = 'array'),
  new_slots jsonb not null check (jsonb_typeof(new_slots) = 'array'),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_settings (
  settings_id smallint primary key default 1 check (settings_id = 1),
  telegram_bot_token text not null default '',
  telegram_chat_id text not null default '',
  updated_at timestamptz not null default now()
);

create unique index if not exists enrollments_one_active_level_idx
  on public.enrollments(student_id, class_level_id) where status = 'Active';
create index if not exists students_parent_id_idx on public.students(parent_id);
create index if not exists teachers_salary_rate_id_idx on public.teachers(salary_rate_id);
create index if not exists classes_teacher_id_idx on public.classes(teacher_id);
create index if not exists enrollments_student_level_status_idx on public.enrollments(student_id, class_level_id, status);
create index if not exists class_schedules_class_day_start_idx on public.class_schedules(class_id, day_of_week, start_time);
create index if not exists enrollment_schedules_schedule_id_idx on public.enrollment_schedules(schedule_id);
create index if not exists enrollment_schedules_enrollment_class_idx on public.enrollment_schedules(enrollment_id, class_id);
create index if not exists enrollment_schedules_schedule_class_idx on public.enrollment_schedules(schedule_id, class_id);
create index if not exists enrollments_class_level_class_idx on public.enrollments(class_level_id, class_id);
create index if not exists expense_transactions_category_paid_idx on public.expense_transactions(expense_category_id, paid_date);
create index if not exists expense_transactions_teacher_month_idx on public.expense_transactions(teacher_id, expense_month);
create index if not exists income_transactions_category_paid_idx on public.income_transactions(income_category_id, paid_date);
create index if not exists income_transactions_enrollment_id_idx on public.income_transactions(enrollment_id);
create index if not exists attendance_records_date_idx on public.attendance_records(attendance_date);
create index if not exists attendance_records_enrollment_idx on public.attendance_records(enrollment_id);
create index if not exists learning_logs_date_idx on public.learning_logs(log_date desc);
create index if not exists learning_logs_enrollment_idx on public.learning_logs(enrollment_id);
create index if not exists learning_logs_class_idx on public.learning_logs(class_id);
create index if not exists enrollment_schedule_changes_enrollment_effective_idx
  on public.enrollment_schedule_changes(enrollment_id, effective_from desc);
create index if not exists income_transactions_class_idx on public.income_transactions(class_id);
create index if not exists income_transactions_origin_idx on public.income_transactions(entry_origin);
create index if not exists expense_transactions_class_idx on public.expense_transactions(class_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at before update on public.students
for each row execute function public.set_updated_at();
drop trigger if exists class_schedules_set_updated_at on public.class_schedules;
create trigger class_schedules_set_updated_at before update on public.class_schedules
for each row execute function public.set_updated_at();
drop trigger if exists enrollments_set_updated_at on public.enrollments;
create trigger enrollments_set_updated_at before update on public.enrollments
for each row execute function public.set_updated_at();
drop trigger if exists expense_categories_set_updated_at on public.expense_categories;
create trigger expense_categories_set_updated_at before update on public.expense_categories
for each row execute function public.set_updated_at();
drop trigger if exists expense_transactions_set_updated_at on public.expense_transactions;
create trigger expense_transactions_set_updated_at before update on public.expense_transactions
for each row execute function public.set_updated_at();
drop trigger if exists income_transactions_set_updated_at on public.income_transactions;
create trigger income_transactions_set_updated_at before update on public.income_transactions
for each row execute function public.set_updated_at();
drop trigger if exists attendance_records_set_updated_at on public.attendance_records;
create trigger attendance_records_set_updated_at before update on public.attendance_records
for each row execute function public.set_updated_at();
drop trigger if exists learning_logs_set_updated_at on public.learning_logs;
create trigger learning_logs_set_updated_at before update on public.learning_logs
for each row execute function public.set_updated_at();
drop trigger if exists notification_settings_set_updated_at on public.notification_settings;
create trigger notification_settings_set_updated_at before update on public.notification_settings
for each row execute function public.set_updated_at();

alter table public.parents enable row level security;
alter table public.students enable row level security;
alter table public.salary_rates enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.class_levels enable row level security;
alter table public.class_schedules enable row level security;
alter table public.enrollments enable row level security;
alter table public.enrollment_schedules enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expense_transactions enable row level security;
alter table public.income_categories enable row level security;
alter table public.income_transactions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.learning_logs enable row level security;
alter table public.enrollment_schedule_changes enable row level security;
alter table public.notification_settings enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on function public.set_updated_at() to service_role;
grant usage, select on all sequences in schema public to service_role;
