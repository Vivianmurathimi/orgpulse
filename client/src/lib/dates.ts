// Today's date in a timezone, as "YYYY-MM-DD"
export function todayIn(timezone: string): string {
  // The en-CA locale happens to write dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

// "2026-11-09" -> "Mon 9 Nov"
export function formatDay(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00Z`));
}

// An exact moment -> "Mon 9 Nov, 08:00" in the organisation's timezone
export function formatMoment(moment: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(moment));
}

// An exact moment -> "08:00" in the organisation's timezone
export function formatTime(moment: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(moment));
}

// The moment something happened, in the viewer's own time
export function formatAgo(moment: string): string {
  const minutes = Math.floor((Date.now() - new Date(moment).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(moment),
  );
}
