// Dates are plain "YYYY-MM-DD" strings, and stored as midnight UTC.

export function toDate(text: string): Date {
  return new Date(`${text}T00:00:00.000Z`);
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// The calendar date right now in a timezone, e.g. "2026-03-14"
export function todayIn(timezone: string, now = new Date()): string {
  // The en-CA locale happens to write dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

// The clock time right now in a timezone, e.g. "18:05"
export function timeIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
}

function isLeapYear(year: number): boolean {
  return new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
}

// Is this person's birthday on this date? 29 Feb birthdays are on 28 Feb in non-leap years.
export function isBirthdayOn(birthday: string, date: string): boolean {
  if (birthday.slice(5) === "02-29" && !isLeapYear(Number(date.slice(0, 4)))) {
    return date.slice(5) === "02-28";
  }
  return birthday.slice(5) === date.slice(5);
}
