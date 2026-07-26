import { z } from "zod";

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine(isCalendarDate, "invalid_date");

export function formatDate(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
