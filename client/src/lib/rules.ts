import type { Rule } from "../types";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const RULE_TYPE_LABEL = { BIRTHDAY: "Birthdays", ROTATION: "Rotation", TASK: "Task" };

// A rule's schedule in plain words, e.g. "Every Monday at 08:00"
export function describeSchedule(rule: Rule): string {
  if (rule.type === "BIRTHDAY") return `On each birthday at ${rule.timeOfDay}`;

  switch (rule.frequency) {
    case "ONCE":
      return `Once on ${rule.startDate} at ${rule.timeOfDay}`;
    case "DAILY":
      return `Every day at ${rule.timeOfDay}`;
    case "WEEKLY":
      return `Every ${WEEKDAYS[rule.dayOfWeek ?? 0]} at ${rule.timeOfDay}`;
    case "MONTHLY":
      return `Day ${rule.dayOfMonth} of each month at ${rule.timeOfDay}`;
  }
}
