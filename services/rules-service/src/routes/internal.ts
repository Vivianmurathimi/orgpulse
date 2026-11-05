import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../../generated/prisma";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { isUniqueViolation, prisma } from "../lib/prisma";
import { toRuleDto, withRotation } from "../lib/rules";
import { validate } from "../lib/validate";

// Routes for the scheduler only. index.ts protects them with requireInternal,
// and the gateway does not forward /internal.
export const internalRouter = Router();

const createTaskSchema = z.object({
  ruleId: z.string(),
  orgId: z.string(),
  title: z.string(),
  assigneeIds: z.array(z.string()),
  dueAt: z.iso.datetime(),
  occurrenceKey: z.string(),
});

const markOverdueSchema = z.object({
  now: z.iso.datetime().optional(),
});

internalRouter.get(
  "/rules",
  asyncHandler(async (req, res) => {
    const rules = await prisma.rule.findMany({
      where: req.query.active === "true" ? { paused: false } : {},
      include: withRotation,
    });
    res.json(rules.map(toRuleDto));
  }),
);

// Open tasks, with how long before the deadline each one wants a reminder
internalRouter.get(
  "/tasks/pending",
  asyncHandler(async (_req, res) => {
    const tasks = await prisma.task.findMany({
      where: { status: "PENDING" },
      include: { rule: { select: { reminderHoursBefore: true } } },
    });
    res.json(
      tasks.map(({ rule, ...task }) => ({ ...task, reminderHoursBefore: rule.reminderHoursBefore })),
    );
  }),
);

// Safe to call twice: the same occurrenceKey returns the task that already exists.
// `created` tells the scheduler whether this call made it, and the task's status
// shows whether an admin skipped this occurrence.
internalRouter.post(
  "/tasks",
  asyncHandler(async (req, res) => {
    const body = validate(createTaskSchema, req.body);

    try {
      const task = await prisma.task.create({ data: body });
      res.status(201).json({ task, created: true });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const task = await prisma.task.findUniqueOrThrow({
          where: { occurrenceKey: body.occurrenceKey },
        });
        res.json({ task, created: false });
        return;
      }
      // P2003 = the ruleId does not exist
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
        throw new HttpError(404, "Rule not found");
      }
      throw err;
    }
  }),
);

internalRouter.post(
  "/tasks/mark-overdue",
  asyncHandler(async (req, res) => {
    const { now } = validate(markOverdueSchema, req.body ?? {});

    const { count } = await prisma.task.updateMany({
      where: { status: "PENDING", dueAt: { lt: now ? new Date(now) : new Date() } },
      data: { status: "OVERDUE" },
    });
    res.json({ count });
  }),
);
