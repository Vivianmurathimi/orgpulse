// Calendar dates are stored as midnight UTC. These helpers stop them shifting by a day.

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
