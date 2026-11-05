import { HttpError } from "../middleware/errorHandler";
import type { DateRange, Schedule } from "./occurrences";

// Calls to the auth and rules services. Their /internal routes need the shared key.

export interface Org {
  id: string;
  name: string;
  timezone: string;
}

export interface Member {
  userId: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  birthday: string | null;
  showBirthday: boolean;
  groupIds: string[];
  unavailability: DateRange[];
}

export interface Rule extends Schedule {
  id: string;
  orgId: string;
  type: "BIRTHDAY" | "ROTATION" | "TASK";
  title: string;
  timeOfDay: string;
  targetGroupId: string | null;
  assigneeIds: string[];
  reminderHoursBefore: number | null;
  rotation: string[]; // member IDs, in order
}

export interface Task {
  id: string;
  ruleId: string;
  orgId: string;
  title: string;
  assigneeIds: string[];
  dueAt: string;
  status: "PENDING" | "DONE" | "OVERDUE" | "SKIPPED";
  occurrenceKey: string;
}

export interface PendingTask extends Task {
  reminderHoursBefore: number | null;
}

export interface NewTask {
  ruleId: string;
  orgId: string;
  title: string;
  assigneeIds: string[];
  dueAt: string;
  occurrenceKey: string;
}

async function call<T>(service: string, baseUrl: string | undefined, path: string, body?: object) {
  if (!baseUrl) {
    throw new Error(`The URL of the ${service} service is not set`);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "x-internal-key": process.env.INTERNAL_KEY ?? "",
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new HttpError(503, `The ${service} service is unavailable, please try again`);
  }

  if (!response.ok) {
    throw new HttpError(502, `The ${service} service answered ${path} with ${response.status}`);
  }
  return (await response.json()) as T;
}

const auth = <T>(path: string) => call<T>("auth", process.env.AUTH_SERVICE_URL, path);
const rules = <T>(path: string, body?: object) =>
  call<T>("rules", process.env.RULES_SERVICE_URL, path, body);

export const getOrgs = () => auth<Org[]>("/internal/orgs");
export const getMembers = (orgId: string) => auth<Member[]>(`/internal/orgs/${orgId}/members`);

export const getActiveRules = () => rules<Rule[]>("/internal/rules?active=true");
export const getPendingTasks = () => rules<PendingTask[]>("/internal/tasks/pending");
export const createTask = (task: NewTask) =>
  rules<{ task: Task; created: boolean }>("/internal/tasks", task);
export const markOverdue = (now: Date) =>
  rules<{ count: number }>("/internal/tasks/mark-overdue", { now: now.toISOString() });
export const resetTasks = (orgId: string, from: Date, to: Date) =>
  rules<{ count: number }>("/internal/tasks/reset", {
    orgId,
    from: from.toISOString(),
    to: to.toISOString(),
  });
