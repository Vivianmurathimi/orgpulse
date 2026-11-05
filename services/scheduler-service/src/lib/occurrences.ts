// "What is due on date X?" Pure functions only: no database and no network,
// so they are easy to test. The scheduler service uses the same logic.
//
// Dates are plain "YYYY-MM-DD" strings, which sort correctly as text.

export interface Schedule {
  frequency: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startDate: string;
}

export interface DateRange {
  from: string;
  to: string;
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  const result = toUtc(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one. `month` is 1-12 here,
  // which is already "the next month" for Date.UTC, where January is 0.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Does a rule with this schedule happen on this date?
export function occursOn(schedule: Schedule, date: string): boolean {
  if (date < schedule.startDate) return false;

  switch (schedule.frequency) {
    case "ONCE":
      return date === schedule.startDate;
    case "DAILY":
      return true;
    case "WEEKLY":
      return toUtc(date).getUTCDay() === schedule.dayOfWeek;
    case "MONTHLY": {
      if (schedule.dayOfMonth === null) return false;
      const [year, month, day] = date.split("-").map(Number);
      return day === Math.min(schedule.dayOfMonth, lastDayOfMonth(year, month));
    }
  }
}

// Is this person's birthday on this date? 29 Feb birthdays are on 28 Feb in non-leap years.
export function isBirthdayOn(birthday: string, date: string): boolean {
  const birthdayMonthDay = birthday.slice(5);
  const [year, month, day] = date.split("-").map(Number);

  if (birthdayMonthDay === "02-29" && lastDayOfMonth(year, 2) === 28) {
    return month === 2 && day === 28;
  }
  return birthdayMonthDay === date.slice(5);
}

export function isUnavailableOn(periods: DateRange[], date: string): boolean {
  return periods.some(({ from, to }) => from <= date && date <= to);
}

// Who does a rotation pick? Start at `position` and take the first available
// person. The position itself always moves on by one per occurrence, so a person
// who was skipped keeps their place in the order.
export function pickRotationMember(
  memberIds: string[],
  position: number,
  isAvailable: (memberId: string) => boolean,
): string | null {
  for (let offset = 0; offset < memberIds.length; offset++) {
    const memberId = memberIds[(position + offset) % memberIds.length];
    if (isAvailable(memberId)) return memberId;
  }
  return null;
}

// How many minutes a timezone is ahead of UTC at a given moment
function timezoneOffsetMinutes(moment: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(moment);

  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const local = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
  return (local - moment.getTime()) / 60_000;
}

// Turns "2026-03-14" + "18:00" in a timezone into the exact moment in time
export function toInstant(date: string, timeOfDay: string, timezone: string): Date {
  const asIfUtc = new Date(`${date}T${timeOfDay}:00.000Z`);

  // Daylight saving can change the offset, so work it out at the first guess,
  // then once more at the corrected time.
  const firstGuess = asIfUtc.getTime() - timezoneOffsetMinutes(asIfUtc, timezone) * 60_000;
  const offset = timezoneOffsetMinutes(new Date(firstGuess), timezone);
  return new Date(asIfUtc.getTime() - offset * 60_000);
}
