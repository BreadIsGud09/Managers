create index if not exists enrollment_schedules_enrollment_class_idx
  on public.enrollment_schedules (enrollment_id, class_id);

create index if not exists enrollment_schedules_schedule_class_idx
  on public.enrollment_schedules (schedule_id, class_id);

create index if not exists enrollments_class_level_class_idx
  on public.enrollments (class_level_id, class_id);

