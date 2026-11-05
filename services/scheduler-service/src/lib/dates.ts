// Dates are plain "YYYY-MM-DD" strings, and stored as midnight UTC.

export function toDate(text: string): Date {
  return new Date(`${text}T00:00:00.000Z`);
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// The calendar date at a moment, in a timezone, e.g. "2026-03-14"
export function dateIn(timezone: string, moment: Date): string {
  // The en-CA locale happens to write dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(moment);
}

// The clock time at a moment, in a timezone, e.g. "18:05"
export function timeIn(timezone: string, moment: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(moment);
}
