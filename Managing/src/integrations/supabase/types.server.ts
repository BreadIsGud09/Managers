// Generated from Supabase project on 2026-08-12.
// Keep this file aligned with the normalized Manager schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.15" };
  public: {
    Tables: {
      parents: Table<
        { parent_id: number; first_name: string; last_name: string; email: string; phone_number: string },
        { parent_id?: never; first_name: string; last_name: string; email: string; phone_number: string }
      >;
      students: Table<
        {
          student_id: number;
          parent_id: number;
          first_name: string;
          last_name: string;
          aka: string | null;
          age: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          student_id?: never;
          parent_id: number;
          first_name: string;
          last_name: string;
          aka?: string | null;
          age?: number;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      salary_rates: Table<
        { salary_rate_id: number; rate_name: string; monthly_salary: number },
        { salary_rate_id?: never; rate_name: string; monthly_salary: number }
      >;
      teachers: Table<
        { teacher_id: number; salary_rate_id: number; first_name: string; last_name: string },
        { teacher_id?: never; salary_rate_id: number; first_name: string; last_name: string }
      >;
      classes: Table<
        {
          class_id: number;
          teacher_id: number;
          class_name: string;
          subject: string | null;
          about: string | null;
          fee: number;
          duration_minutes: number | null;
          prerequisite: string | null;
        },
        {
          class_id?: never;
          teacher_id: number;
          class_name: string;
          subject?: string | null;
          about?: string | null;
          fee: number;
          duration_minutes?: number | null;
          prerequisite?: string | null;
        }
      >;
      class_levels: Table<
        { class_level_id: number; class_id: number; level: string; requirement: string | null },
        { class_level_id?: never; class_id: number; level: string; requirement?: string | null }
      >;
      class_schedules: Table<
        {
          schedule_id: number;
          class_id: number;
          day_of_week: number;
          start_time: string;
          end_time: string;
          student_capacity: number;
          is_active: boolean;
          location: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          schedule_id?: never;
          class_id: number;
          day_of_week: number;
          start_time: string;
          end_time: string;
          student_capacity: number;
          is_active?: boolean;
          location?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      enrollments: Table<
        {
          enrollment_id: number;
          student_id: number;
          class_id: number;
          class_level_id: number;
          enroll_date: string;
          ending_date: string | null;
          status: string;
          agreed_fee: number;
          total_sessions: number;
          reserve_days: number;
          status_detail: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          enrollment_id?: never;
          student_id: number;
          class_id: number;
          class_level_id: number;
          enroll_date: string;
          ending_date?: string | null;
          status: string;
          agreed_fee: number;
          total_sessions?: number;
          reserve_days?: number;
          status_detail?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      enrollment_schedules: Table<
        { enrollment_id: number; schedule_id: number; class_id: number },
        { enrollment_id: number; schedule_id: number; class_id: number }
      >;
      attendance_records: Table<
        {
          attendance_id: number;
          enrollment_id: number;
          attendance_date: string;
          status: string;
          note: string | null;
          makeup_date: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          attendance_id?: never;
          enrollment_id: number;
          attendance_date: string;
          status: string;
          note?: string | null;
          makeup_date?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      enrollment_schedule_changes: Table<
        {
          change_id: number;
          enrollment_id: number;
          effective_from: string;
          old_slots: Json;
          new_slots: Json;
          reason: string | null;
          created_at: string;
        },
        {
          change_id?: never;
          enrollment_id: number;
          effective_from: string;
          old_slots: Json;
          new_slots: Json;
          reason?: string | null;
          created_at?: string;
        }
      >;
      learning_logs: Table<
        {
          learning_log_id: number;
          enrollment_id: number | null;
          class_id: number;
          log_date: string;
          title: string;
          content: string | null;
          attachments: Json;
          is_class_wide: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          learning_log_id?: never;
          enrollment_id?: number | null;
          class_id: number;
          log_date: string;
          title: string;
          content?: string | null;
          attachments?: Json;
          is_class_wide?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      expense_categories: Table<
        {
          expense_category_id: number;
          category_name: string;
          default_amount: number;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          expense_category_id?: never;
          category_name: string;
          default_amount?: number;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      expense_transactions: Table<
        {
          expense_id: number;
          expense_category_id: number;
          teacher_id: number | null;
          class_id: number | null;
          expense_month: string | null;
          amount: number;
          incurred_date: string;
          due_date: string | null;
          paid_date: string | null;
          description: string | null;
          status: string;
          is_fixed: boolean;
          quantity: number | null;
          unit_amount: number | null;
          created_at: string;
          updated_at: string;
        },
        {
          expense_id?: never;
          expense_category_id: number;
          teacher_id?: number | null;
          class_id?: number | null;
          expense_month?: string | null;
          amount: number;
          incurred_date: string;
          due_date?: string | null;
          paid_date?: string | null;
          description?: string | null;
          status: string;
          is_fixed?: boolean;
          quantity?: number | null;
          unit_amount?: number | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      income_categories: Table<
        { income_category_id: number; category_name: string },
        { income_category_id?: never; category_name: string }
      >;
      income_transactions: Table<
        {
          income_id: number;
          income_category_id: number;
          enrollment_id: number | null;
          class_id: number | null;
          amount: number;
          billing_month: string | null;
          due_date: string | null;
          paid_date: string | null;
          description: string | null;
          status: string;
          income_type: string;
          student_name: string | null;
          course_label: string | null;
          term_start: string | null;
          term_end: string | null;
          quantity: number | null;
          unit_amount: number | null;
          entry_origin: string;
          installment_index: number | null;
          created_at: string;
          updated_at: string;
        },
        {
          income_id?: never;
          income_category_id: number;
          enrollment_id?: number | null;
          class_id?: number | null;
          amount: number;
          billing_month?: string | null;
          due_date?: string | null;
          paid_date?: string | null;
          description?: string | null;
          status: string;
          income_type?: string;
          student_name?: string | null;
          course_label?: string | null;
          term_start?: string | null;
          term_end?: string | null;
          quantity?: number | null;
          unit_amount?: number | null;
          entry_origin?: string;
          installment_index?: number | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      notification_settings: Table<
        { settings_id: number; telegram_bot_token: string; telegram_chat_id: string; updated_at: string },
        { settings_id?: number; telegram_bot_token?: string; telegram_chat_id?: string; updated_at?: string }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<Name extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][Name]["Row"];

