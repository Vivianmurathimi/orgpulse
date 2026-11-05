// Calendar dates (birthdays, unavailability) are stored as midnight UTC.
// Always convert with these helpers, so a date never shifts by a day.

// "2026-03-14" -> Date
export function toDate(text: string): Date {
  return new Date(`${text}T00:00:00.000Z`);
}

// Date -> "2026-03-14"
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Today's calendar date in a timezone, e.g. "2026-03-14"
export function todayIn(timezone: string): string {
  // The en-CA locale happens to write dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}
