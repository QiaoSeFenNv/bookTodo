/** Compare "HH:mm" strings. Returns negative if a < b. */
export function compareTime(a: string, b: string): number {
  return toMinutes(a) - toMinutes(b);
}

export function toMinutes(value: string): number {
  const [h, m] = value.split(":").map((part) => Number(part));
  return h * 60 + m;
}

export function isValidTimeRange(start: string, end: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return false;
  return toMinutes(end) > toMinutes(start);
}

export function formatRange(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  return `${start}–${end}`;
}
