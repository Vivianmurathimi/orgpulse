// The shapes of the data the API sends back

export type Role = "ADMIN" | "MEMBER";

export interface User {
  id: string;
  email: string;
  name: string;
  birthday: string | null;
  showBirthday: boolean;
}

export interface Membership {
  membershipId: string;
  orgId: string;
  orgName: string;
  role: Role;
}

export interface Org {
  id: string;
  name: string;
  timezone: string;
  inviteCode?: string; // admins only
}

export type TaskStatus = "PENDING" | "DONE" | "OVERDUE" | "SKIPPED";

export interface Task {
  id: string;
  ruleId: string;
  title: string;
  assigneeIds: string[];
  dueAt: string;
  status: TaskStatus;
  completedAt: string | null;
}

export interface UpcomingItem {
  taskId: string | null; // null means it is only predicted so far
  ruleId: string;
  title: string;
  dueAt: string;
  status: TaskStatus | "PREDICTED";
  predicted: boolean;
}

export type Category = "BIRTHDAY" | "TASK" | "REMINDER" | "SWAP" | "STATUS";

export interface Notification {
  id: string;
  category: Category;
  title: string;
  message: string;
  data: Record<string, string> | null;
  read: boolean;
  createdAt: string;
}

export interface Wish {
  id: string;
  birthdayUserId: string;
  birthdayDate: string;
  fromUserId: string;
  fromName: string;
  text: string;
}

export interface Member {
  membershipId: string;
  userId: string;
  name: string;
  role: Role;
  birthday: string | null;
  groups: { id: string; name: string }[];
}

export interface Group {
  id: string;
  name: string;
  membershipIds: string[];
}

export type RuleType = "BIRTHDAY" | "ROTATION" | "TASK";
export type Frequency = "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY";

export interface Rule {
  id: string;
  type: RuleType;
  title: string;
  description: string | null;
  frequency: Frequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  startDate: string;
  targetGroupId: string | null;
  assigneeIds: string[];
  reminderHoursBefore: number | null;
  paused: boolean;
  rotation: string[];
}

export interface PreviewRow {
  date: string;
  ruleId: string;
  ruleTitle: string;
  type: RuleType;
  who: string[];
}

export interface Board {
  from: string;
  to: string;
  PENDING: Task[];
  OVERDUE: Task[];
  DONE: Task[];
  SKIPPED: Task[];
}

export interface Preference {
  quietFrom: string | null;
  quietTo: string | null;
  mutedCategories: Category[];
}

export interface RunSummary {
  birthdays: number;
  tasks: number;
  reminders: number;
  skipped: number;
}

export interface SwapRequest {
  id: string;
  taskId: string;
  fromId: string;
  toId: string;
}
