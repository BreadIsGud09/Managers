/**
 * Pure compatibility conversions between legacy UI values and the normalized
 * Manager schema. This module contains no Supabase client and performs no I/O;
 * database queries live in `src/server/database`.
 */
import { z } from "zod";

import type { StudentStatus } from "@/Shared/shared";

export const ClassTypeSchema = z.enum(["Piano", "Múa", "Vẽ"]);
export type ManagerClassType = z.infer<typeof ClassTypeSchema>;

export const NumericIdSchema = z.string().regex(/^\d+$/, "Invalid database identifier");

export function numericId(value: string): number {
  const parsed = Number(NumericIdSchema.parse(value));
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Invalid database identifier");
  return parsed;
}

export function joinName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

export function databaseDayToUi(day: number): number {
  return day === 7 ? 0 : day;
}

export function uiDayToDatabase(day: number): number {
  return day === 0 ? 7 : day;
}

export function shortTime(value: string): string {
  return value.slice(0, 5);
}
/** Shared Vietnamese mobile rule used by parent forms and server validation. */
export function IsValidPhoneNumber(value: string): boolean {
  const phoneRegex = /^(?:\+?84|0)(?:3[2-9]|5[6|8|9]|7[0|6-9]|8[1-5]|9[0-4|6-9])[0-9]{7}$/;
  return phoneRegex.test(value);
}

export function statusToDatabase(status: StudentStatus): string {
  switch (status) {
    case "Chuẩn bị":
      return "PendingSchedule";
    case "Đang học":
      return "Active";
    case "Hoàn thành":
    case "Kết thúc":
      return "Completed";
    case "Bảo lưu":
    case "Nghỉ phép":
      return "Cancelled";
  }
}
