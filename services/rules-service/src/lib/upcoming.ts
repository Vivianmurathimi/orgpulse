import type { Task } from "../../generated/prisma";
import { getMembers, getOrg, type Member, type Org } from "./authClient";
import { todayIn } from "./dates";
import {
  addDays,
  isBirthdayOn,
  isUnavailableOn,
  occursOn,
  pickRotationMember,
  toInstant,
} from "./occurrences";
import { prisma } from "./prisma";
import { toRuleDto, withRotation } from "./rules";

export interface Occurrence {
  date: string;
  ruleId: string;
  ruleTitle: string;
  type: "BIRTHDAY" | "ROTATION" | "TASK";
  memberIds: string[];
  who: string[]; // names of memberIds
  dueAt: Date;
  taskId: string | null; // null until the scheduler has created the task
}

// Everyone a TASK rule applies to: named people plus the target group
export function taskRuleMembers(
  rule: { assigneeIds: string[]; targetGroupId: string | null },
  members: Member[],
): string[] {
  const inGroup = members
    .filter((member) => rule.targetGroupId && member.groupIds.includes(rule.targetGroupId))
    .map((member) => member.userId);
  return [...new Set([...rule.assigneeIds, ...inGroup])];
}

// Works out what will happen in the next `days` days, including today.
// This only reads: nothing is created and nobody is notified.
export async function listOccurrences(
  orgId: string,
  days: number,
  org?: Org,
): Promise<Occurrence[]> {
  const { timezone } = org ?? (await getOrg(orgId));
  const members = await getMembers(orgId);
  const memberById = new Map(members.map((member) => [member.userId, member]));
  const nameOf = (id: string) => memberById.get(id)?.name ?? "Unknown";

  const rows = await prisma.rule.findMany({
    where: { orgId, paused: false },
    include: withRotation,
    orderBy: { createdAt: "asc" },
  });
  const rules = rows.map(toRuleDto);
  const ruleIds = rules.map((rule) => rule.id);

  // Occurrences that already exist as tasks use the real task, not a prediction
  const tasks = await prisma.task.findMany({ where: { ruleId: { in: ruleIds } } });
  const taskByKey = new Map<string, Task>(tasks.map((task) => [task.occurrenceKey, task]));

  // The scheduler moves a rotation on by one for each task it creates, so
  // counting those tasks tells us where the rotation has got to.
  const positions = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== "SKIPPED") {
      positions.set(task.ruleId, (positions.get(task.ruleId) ?? 0) + 1);
    }
  }

  const today = todayIn(timezone);
  const occurrences: Occurrence[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);

    for (const rule of rules) {
      const add = (memberIds: string[], taskId: string | null, dueAt?: Date) => {
        occurrences.push({
          date,
          ruleId: rule.id,
          ruleTitle: rule.title,
          type: rule.type,
          memberIds,
          who: memberIds.map(nameOf),
          dueAt: dueAt ?? toInstant(date, rule.timeOfDay, timezone),
          taskId,
        });
      };

      if (rule.type === "BIRTHDAY") {
        for (const member of members) {
          if (member.showBirthday && member.birthday && isBirthdayOn(member.birthday, date)) {
            add([member.userId], null);
          }
        }
        continue;
      }

      if (!occursOn(rule, date)) continue;

      const task = taskByKey.get(`${rule.id}:${date}`);
      if (task?.status === "SKIPPED") continue;
      if (task) {
        add(task.assigneeIds, task.id, task.dueAt);
        continue;
      }

      if (rule.type === "ROTATION") {
        if (rule.rotation.length === 0) continue;

        const position = positions.get(rule.id) ?? 0;
        const picked = pickRotationMember(rule.rotation, position, (memberId) => {
          const member = memberById.get(memberId);
          return member !== undefined && !isUnavailableOn(member.unavailability, date);
        });
        add(picked ? [picked] : [], null);
        positions.set(rule.id, position + 1);
        continue;
      }

      add(taskRuleMembers(rule, members), null);
    }
  }

  return occurrences;
}
