import { z } from "zod";
import { emitToOrg } from "../realtime";
import { getMembers, type Member } from "./authClient";
import { notify, type Draft } from "./notify";
import { validate } from "./validate";

// What to do with each Redis event: who hears about it, and what it says.

const event = { eventId: z.string().min(1), orgId: z.string().min(1) };

const birthdaySchema = z.object({
  ...event,
  memberId: z.string(),
  memberName: z.string(),
  date: z.string(),
});

const dueTaskSchema = z.object({
  ...event,
  ruleId: z.string(),
  taskId: z.string(),
  assigneeIds: z.array(z.string()),
  title: z.string(),
  dueAt: z.string(),
});

const reminderSchema = z.object({
  ...event,
  taskId: z.string(),
  assigneeIds: z.array(z.string()),
  title: z.string(),
  dueAt: z.string(),
});

const completedSchema = z.object({
  ...event,
  taskId: z.string(),
  title: z.string(),
  completedBy: z.string(),
  completedByName: z.string(),
});

const swapRequestedSchema = z.object({
  ...event,
  swapId: z.string(),
  taskId: z.string(),
  title: z.string(),
  fromId: z.string(),
  fromName: z.string(),
  toId: z.string(),
});

const swappedSchema = z.object({
  ...event,
  taskId: z.string(),
  title: z.string(),
  fromId: z.string(),
  toId: z.string(),
});

const adminIds = (members: Member[]) =>
  members.filter((member) => member.role === "ADMIN").map((member) => member.userId);

// Live status boards reload when they hear this. It carries no private details.
function taskUpdated(orgId: string, taskId: string, reason: string) {
  emitToOrg(orgId, "task:updated", { taskId, reason });
}

async function onBirthday(raw: unknown) {
  const { eventId, orgId, memberId, memberName, date } = validate(birthdaySchema, raw);
  const members = await getMembers(orgId);

  await notify(
    orgId,
    eventId,
    members.map(({ userId }) => ({
      userId,
      category: "BIRTHDAY",
      title: "Birthday",
      message:
        userId === memberId
          ? `Happy birthday, ${memberName}! 🎉`
          : `Today is ${memberName}'s birthday 🎉`,
      data: { memberId, memberName, date },
    })),
  );
}

async function onDueTask(raw: unknown) {
  const { eventId, orgId, ruleId, taskId, assigneeIds, title, dueAt } = validate(dueTaskSchema, raw);
  const data = { ruleId, taskId, dueAt };

  // Nobody could be assigned, so an admin has to step in
  if (assigneeIds.length === 0) {
    const admins = adminIds(await getMembers(orgId));
    await notify(
      orgId,
      eventId,
      admins.map((userId) => ({
        userId,
        category: "TASK",
        title,
        message: `Nobody is available for ${title}`,
        data,
      })),
    );
  } else {
    await notify(
      orgId,
      eventId,
      assigneeIds.map((userId) => ({
        userId,
        category: "TASK",
        title,
        message: `You're on duty: ${title}`,
        data,
      })),
    );
  }

  taskUpdated(orgId, taskId, "created");
}

async function onReminder(raw: unknown) {
  const { eventId, orgId, taskId, assigneeIds, title, dueAt } = validate(reminderSchema, raw);

  await notify(
    orgId,
    eventId,
    assigneeIds.map((userId) => ({
      userId,
      category: "REMINDER",
      title,
      message: `Reminder: ${title} is coming up`,
      data: { taskId, dueAt },
    })),
  );
}

async function onCompleted(raw: unknown) {
  const { eventId, orgId, taskId, title, completedBy, completedByName } = validate(
    completedSchema,
    raw,
  );
  const members = await getMembers(orgId);

  await notify(
    orgId,
    eventId,
    adminIds(members)
      .filter((userId) => userId !== completedBy)
      .map((userId) => ({
        userId,
        category: "STATUS",
        title,
        message: `${completedByName} completed ${title}`,
        data: { taskId, completedBy },
      })),
  );

  taskUpdated(orgId, taskId, "completed");
}

async function onSwapRequested(raw: unknown) {
  const { eventId, orgId, swapId, taskId, title, fromId, fromName, toId } = validate(
    swapRequestedSchema,
    raw,
  );

  await notify(orgId, eventId, [
    {
      userId: toId,
      category: "SWAP",
      title,
      message: `${fromName} asked you to take over ${title}`,
      data: { swapId, taskId, fromId },
    },
  ]);

  taskUpdated(orgId, taskId, "swap_requested");
}

async function onSwapped(raw: unknown) {
  const { eventId, orgId, taskId, title, fromId, toId } = validate(swappedSchema, raw);
  const members = await getMembers(orgId);
  const nameOf = (id: string) =>
    members.find((member) => member.userId === id)?.name ?? "Someone";
  const data = { taskId, fromId, toId };

  // A person can be both an admin and part of the swap, so use one message each
  const drafts = new Map<string, Draft>();
  const add = (userId: string, message: string) => {
    if (!drafts.has(userId)) {
      drafts.set(userId, { userId, category: "SWAP", title, message, data });
    }
  };

  add(fromId, `${nameOf(toId)} accepted your swap for ${title}`);
  add(toId, `You're now responsible for ${title}`);
  for (const userId of adminIds(members)) {
    add(userId, `${nameOf(fromId)} swapped ${title} with ${nameOf(toId)}`);
  }

  await notify(orgId, eventId, [...drafts.values()]);
  taskUpdated(orgId, taskId, "swapped");
}

export const handlers: Record<string, (raw: unknown) => Promise<void>> = {
  "due.birthday": onBirthday,
  "due.task": onDueTask,
  "due.reminder": onReminder,
  "task.completed": onCompleted,
  "task.swap_requested": onSwapRequested,
  "task.swapped": onSwapped,
};
