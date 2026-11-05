import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireAdmin, requireOrg } from "../middleware/requireOrg";
import { getMembers, getOrg, getUserName } from "../lib/authClient";
import { todayIn } from "../lib/dates";
import { publishEvent } from "../lib/events";
import { addDays, toInstant } from "../lib/occurrences";
import { prisma } from "../lib/prisma";
import { listOccurrences } from "../lib/upcoming";
import { dateSchema, validate } from "../lib/validate";

export const tasksRouter = Router();

const UPCOMING_DAYS = 28;

const boardSchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

const swapSchema = z.object({
  toMemberId: z.string().min(1, "is required"),
});

async function findTask(id: string, orgId: string) {
  const task = await prisma.task.findFirst({ where: { id, orgId } });
  if (!task) {
    throw new HttpError(404, "Task not found");
  }
  return task;
}

// My open tasks plus what is predicted for me in the next 4 weeks
tasksRouter.get(
  "/mine/upcoming",
  requireOrg,
  asyncHandler(async (req, res) => {
    const { userId, orgId } = req.user!;
    const org = await getOrg(orgId!);

    const tasks = await prisma.task.findMany({
      where: { orgId, assigneeIds: { has: userId }, status: { in: ["PENDING", "OVERDUE"] } },
    });
    const existing = tasks.map((task) => ({
      taskId: task.id,
      ruleId: task.ruleId,
      title: task.title,
      dueAt: task.dueAt,
      status: task.status,
      predicted: false,
    }));

    const occurrences = await listOccurrences(orgId!, UPCOMING_DAYS, org);
    const predicted = occurrences
      .filter((item) => item.type !== "BIRTHDAY" && !item.taskId && item.memberIds.includes(userId))
      .map((item) => ({
        taskId: null,
        ruleId: item.ruleId,
        title: item.ruleTitle,
        dueAt: item.dueAt,
        status: "PREDICTED",
        predicted: true,
      }));

    res.json(
      [...existing, ...predicted].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    );
  }),
);

// My tasks due today, in the organisation's timezone
tasksRouter.get(
  "/today",
  requireOrg,
  asyncHandler(async (req, res) => {
    const { userId, orgId } = req.user!;
    const { timezone } = await getOrg(orgId!);
    const today = todayIn(timezone);

    const tasks = await prisma.task.findMany({
      where: {
        orgId,
        assigneeIds: { has: userId },
        status: { not: "SKIPPED" },
        dueAt: {
          gte: toInstant(today, "00:00", timezone),
          lt: toInstant(addDays(today, 1), "00:00", timezone),
        },
      },
      orderBy: { dueAt: "asc" },
    });
    res.json(tasks);
  }),
);

// Status board. Defaults to the next 7 days.
tasksRouter.get(
  "/board",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const orgId = req.user!.orgId!;
    const { timezone } = await getOrg(orgId);

    const today = todayIn(timezone);
    const query = validate(boardSchema, req.query);
    const from = query.from ?? today;
    const to = query.to ?? addDays(from, 6);
    if (from > to) {
      throw new HttpError(400, "from must not be after to");
    }

    const tasks = await prisma.task.findMany({
      where: {
        orgId,
        dueAt: {
          gte: toInstant(from, "00:00", timezone),
          lt: toInstant(addDays(to, 1), "00:00", timezone),
        },
      },
      orderBy: { dueAt: "asc" },
    });

    res.json({
      from,
      to,
      PENDING: tasks.filter((task) => task.status === "PENDING"),
      OVERDUE: tasks.filter((task) => task.status === "OVERDUE"),
      DONE: tasks.filter((task) => task.status === "DONE"),
      SKIPPED: tasks.filter((task) => task.status === "SKIPPED"),
    });
  }),
);

tasksRouter.patch(
  "/:id/done",
  requireOrg,
  asyncHandler(async (req, res) => {
    const { userId, orgId, role } = req.user!;
    const task = await findTask(req.params.id, orgId!);

    if (!task.assigneeIds.includes(userId) && role !== "ADMIN") {
      throw new HttpError(403, "Only the assignee or an admin can complete this task");
    }
    if (task.status === "SKIPPED") {
      throw new HttpError(400, "This task was skipped");
    }

    // The status check stops two people completing it at once, which would
    // notify everyone twice.
    const { count } = await prisma.task.updateMany({
      where: { id: task.id, status: { in: ["PENDING", "OVERDUE"] } },
      data: { status: "DONE", completedAt: new Date() },
    });

    if (count === 1) {
      // A missing name is not worth failing over: the task is already saved
      const completedByName = await getUserName(userId).catch(() => "Someone");
      publishEvent("task.completed", {
        orgId,
        taskId: task.id,
        title: task.title,
        completedBy: userId,
        completedByName,
      });
    }

    res.json(await findTask(task.id, orgId!));
  }),
);

tasksRouter.post(
  "/:id/swap",
  requireOrg,
  asyncHandler(async (req, res) => {
    const { toMemberId } = validate(swapSchema, req.body);
    const { userId, orgId } = req.user!;
    const task = await findTask(req.params.id, orgId!);

    if (!task.assigneeIds.includes(userId)) {
      throw new HttpError(403, "Only an assignee can request a swap");
    }
    if (task.status !== "PENDING") {
      throw new HttpError(400, "Only pending tasks can be swapped");
    }
    if (task.assigneeIds.includes(toMemberId)) {
      throw new HttpError(400, "That person is already assigned to this task");
    }

    const members = await getMembers(orgId!);
    if (!members.some((member) => member.userId === toMemberId)) {
      throw new HttpError(400, "That person is not in this organisation");
    }

    const open = await prisma.swapRequest.findFirst({ where: { taskId: task.id, status: "OPEN" } });
    if (open) {
      throw new HttpError(409, "This task already has an open swap request");
    }

    const swap = await prisma.swapRequest.create({
      data: { taskId: task.id, fromId: userId, toId: toMemberId },
    });

    publishEvent("task.swap_requested", {
      orgId,
      swapId: swap.id,
      taskId: task.id,
      title: task.title,
      fromId: userId,
      fromName: members.find((member) => member.userId === userId)?.name ?? "Someone",
      toId: toMemberId,
    });

    res.status(201).json(swap);
  }),
);
