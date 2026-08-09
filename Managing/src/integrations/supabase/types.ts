export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          makeup_date: string | null
          note: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          makeup_date?: string | null
          note?: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          makeup_date?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedule: {
        Row: {
          class_type: Database["public"]["Enums"]["class_type"]
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          location: string | null
          start_time: string
        }
        Insert: {
          class_type: Database["public"]["Enums"]["class_type"]
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          location?: string | null
          start_time: string
        }
        Update: {
          class_type?: Database["public"]["Enums"]["class_type"]
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          location?: string | null
          start_time?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          active: boolean
          created_at: string
          default_amount: number
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_amount?: number
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_amount?: number
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      finance_entries: {
        Row: {
          amount: number
          category: string
          class_type: string | null
          course_label: string | null
          created_at: string
          id: string
          income_type: string | null
          is_fixed: boolean
          kind: string
          month: string
          note: string | null
          paid_date: string | null
          quantity: number
          student_name: string | null
          term_end: string | null
          term_start: string | null
          unit_amount: number
          updated_at: string
        }
        Insert: {
          amount?: number
          category: string
          class_type?: string | null
          course_label?: string | null
          created_at?: string
          id?: string
          income_type?: string | null
          is_fixed?: boolean
          kind: string
          month: string
          note?: string | null
          paid_date?: string | null
          quantity?: number
          student_name?: string | null
          term_end?: string | null
          term_start?: string | null
          unit_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          class_type?: string | null
          course_label?: string | null
          created_at?: string
          id?: string
          income_type?: string | null
          is_fixed?: boolean
          kind?: string
          month?: string
          note?: string | null
          paid_date?: string | null
          quantity?: number
          student_name?: string | null
          term_end?: string | null
          term_start?: string | null
          unit_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      learning_logs: {
        Row: {
          attachments: Json
          class_type: Database["public"]["Enums"]["class_type"]
          content: string | null
          created_at: string
          date: string
          id: string
          is_class_wide: boolean
          student_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          class_type: Database["public"]["Enums"]["class_type"]
          content?: string | null
          created_at?: string
          date: string
          id?: string
          is_class_wide?: boolean
          student_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          class_type?: Database["public"]["Enums"]["class_type"]
          content?: string | null
          created_at?: string
          date?: string
          id?: string
          is_class_wide?: boolean
          student_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_logs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          age: number
          created_at: string
          id: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          age?: number
          created_at?: string
          id?: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          age?: number
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      schedule_changes: {
        Row: {
          created_at: string
          effective_from: string
          id: string
          new_slots: Json
          old_slots: Json
          reason: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          id?: string
          new_slots?: Json
          old_slots?: Json
          reason?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          id?: string
          new_slots?: Json
          old_slots?: Json
          reason?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_changes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          age: number
          class_type: Database["public"]["Enums"]["class_type"]
          course_index: number
          created_at: string
          end_date: string
          id: string
          name: string
          person_id: string | null
          reserve_days: number
          schedule_days: number[]
          schedule_slots: Json
          sessions_per_day: number
          start_date: string
          status: Database["public"]["Enums"]["student_status"]
          total_sessions: number
          tuition: number
          updated_at: string
        }
        Insert: {
          age: number
          class_type: Database["public"]["Enums"]["class_type"]
          course_index?: number
          created_at?: string
          end_date: string
          id?: string
          name: string
          person_id?: string | null
          reserve_days?: number
          schedule_days?: number[]
          schedule_slots?: Json
          sessions_per_day?: number
          start_date: string
          status?: Database["public"]["Enums"]["student_status"]
          total_sessions?: number
          tuition?: number
          updated_at?: string
        }
        Update: {
          age?: number
          class_type?: Database["public"]["Enums"]["class_type"]
          course_index?: number
          created_at?: string
          end_date?: string
          id?: string
          name?: string
          person_id?: string | null
          reserve_days?: number
          schedule_days?: number[]
          schedule_slots?: Json
          sessions_per_day?: number
          start_date?: string
          status?: Database["public"]["Enums"]["student_status"]
          total_sessions?: number
          tuition?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_settings: {
        Row: {
          bot_token: string | null
          chat_id: string | null
          id: number
          updated_at: string
        }
        Insert: {
          bot_token?: string | null
          chat_id?: string | null
          id?: number
          updated_at?: string
        }
        Update: {
          bot_token?: string | null
          chat_id?: string | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      tuition_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          ky_index: number
          month: string
          note: string | null
          paid_date: string
          student_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          ky_index?: number
          month: string
          note?: string | null
          paid_date?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          ky_index?: number
          month?: string
          note?: string | null
          paid_date?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tuition_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      attendance_status:
        | "Đi học"
        | "Nghỉ có phép"
        | "Nghỉ không phép"
        | "Bảo lưu"
      class_type: "Piano" | "Múa" | "Vẽ"
      student_status:
        | "Đang học"
        | "Nghỉ phép"
        | "Bảo lưu"
        | "Kết thúc"
        | "Hoàn thành"
        | "Chuẩn bị"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      attendance_status: [
        "Đi học",
        "Nghỉ có phép",
        "Nghỉ không phép",
        "Bảo lưu",
      ],
      class_type: ["Piano", "Múa", "Vẽ"],
      student_status: [
        "Đang học",
        "Nghỉ phép",
        "Bảo lưu",
        "Kết thúc",
        "Hoàn thành",
        "Chuẩn bị",
      ],
    },
  },
} as const
