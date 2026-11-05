import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireAdmin } from "../middleware/requireOrg";
import { getMembers, getOrg } from "../lib/authClient";
import { toDate } from "../lib/dates";
import { occursOn, toInstant } from "../lib/occurrences";
import { prisma } from "../lib/prisma";
import { toRuleDto, withRotation } from "../lib/rules";
import { listOccurrences } from "../lib/upcoming";
import { dateSchema, validate } from "../lib/validate";

export const rulesRouter = Router();

// Every route here is for admins
rulesRouter.use(requireAdmin);

const ruleFields = z.object({
  type: z.enum(["BIRTHDAY", "ROTATION", "TASK"], { error: "must be BIRTHDAY, ROTATION or TASK" }),
  title: z.string().trim().min(1, "is required").max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  frequency: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY"], {
    error: "must be ONCE, DAILY, WEEKLY or MONTHLY",
  }),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must look like 18:00"),
  startDate: dateSchema,
  targetGroupId: z.string().nullable().optional(),
  assigneeIds: z.array(z.string()),
  reminderHoursBefore: z.number().int().min(1).max(720).nullable().optional(),
});

// Checks that need several fields at once. A rotation's people are set
// separately, with PUT /:id/rotation.
const ruleSchema = ruleFields.superRefine((rule, ctx) => {
  if (rule.frequency === "WEEKLY" && rule.dayOfWeek == null) {
    ctx.addIssue({ code: "custom", path: ["dayOfWeek"], message: "is required for a weekly rule" });
  }
  if (rule.frequency === "MONTHLY" && rule.dayOfMonth == null) {
    ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "is required for a monthly rule" });
  }
  if (rule.type === "TASK" && rule.assigneeIds.length === 0 && !rule.targetGroupId) {
    ctx.addIssue({ code: "custom", message: "A task rule needs assigneeIds or a targetGroupId" });
  }
});

const patchSchema = ruleFields
  .omit({ type: true }) // a rule cannot change type
  .extend({ paused: z.boolean() })
  .partial();

const rotationSchema = z.object({
  memberIds: z
    .array(z.string())
    .min(1, "needs at least one member")
    .refine((ids) => new Set(ids).size === ids.length, { error: "cannot contain duplicates" }),
});

const skipSchema = z.object({ date: dateSchema });

const previewSchema = z.object({
  days: z.coerce.number().int().min(1).max(60).default(7),
});

// People and groups live in the auth service, so ask it whether they are in this org
async function assertInOrg(
  orgId: string,
  { memberIds = [], groupId }: { memberIds?: string[]; groupId?: string | null },
): Promise<void> {
  if (memberIds.length === 0 && !groupId) return;

  const members = await getMembers(orgId);
  const known = new Set(members.map((member) => member.userId));
  if (!memberIds.every((id) => known.has(id))) {
    throw new HttpError(400, "All members must belong to this organisation");
  }
  if (groupId && !members.some((member) => member.groupIds.includes(groupId))) {
    throw new HttpError(400, "That group does not exist or has no members");
  }
}

async function findRule(id: string, orgId: string) {
  // Checking orgId stops admins from reaching another organisation's rules
  const rule = await prisma.rule.findFirst({ where: { id, orgId }, include: withRotation });
  if (!rule) {
    throw new HttpError(404, "Rule not found");
  }
  return rule;
}

rulesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rules = await prisma.rule.findMany({
      where: { orgId: req.user!.orgId },
      include: withRotation,
      orderBy: { createdAt: "asc" },
    });
    res.json(rules.map(toRuleDto));
  }),
);

// Must stay above "/:id", otherwise "preview" would be treated as an id
rulesRouter.get(
  "/preview",
  asyncHandler(async (req, res) => {
    const { days } = validate(previewSchema, req.query);
    const occurrences = await listOccurrences(req.user!.orgId!, days);

    res.json(
      occurrences.map(({ date, ruleTitle, type, who }) => ({ date, ruleTitle, type, who })),
    );
  }),
);

rulesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { userId, orgId } = req.user!;
    const body = typeof req.body === "object" && req.body !== null ? req.body : {};

    // A birthday rule always runs daily: each day it looks for that day's birthdays
    const rule = validate(ruleSchema, {
      assigneeIds: [],
      timeOfDay: "08:00",
      ...body,
      ...(body.type === "BIRTHDAY" && { frequency: "DAILY" }),
    });
    await assertInOrg(orgId!, { memberIds: rule.assigneeIds, groupId: rule.targetGroupId });

    const created = await prisma.rule.create({
      data: { ...rule, startDate: toDate(rule.startDate), orgId: orgId!, createdBy: userId },
      include: withRotation,
    });
    res.status(201).json(toRuleDto(created));
  }),
);

rulesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(toRuleDto(await findRule(req.params.id, req.user!.orgId!)));
  }),
);

// Editing changes future occurrences. Tasks that already exist stay as they are.
rulesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const orgId = req.user!.orgId!;
    const existing = toRuleDto(await findRule(req.params.id, orgId));

    const { paused, ...changes } = validate(patchSchema, req.body);

    // Check the rule as it will be after the change, so it stays valid as a whole
    const { type, title, description, frequency, dayOfWeek, dayOfMonth } = existing;
    const { timeOfDay, startDate, targetGroupId, assigneeIds, reminderHoursBefore } = existing;
    const merged = validate(ruleSchema, {
      type, title, description, frequency, dayOfWeek, dayOfMonth,
      timeOfDay, startDate, targetGroupId, assigneeIds, reminderHoursBefore,
      ...changes,
      ...(type === "BIRTHDAY" && { frequency: "DAILY" }),
    });
    await assertInOrg(orgId, { memberIds: changes.assigneeIds, groupId: changes.targetGroupId });

    const updated = await prisma.rule.update({
      where: { id: existing.id },
      data: { ...merged, startDate: toDate(merged.startDate), paused },
      include: withRotation,
    });
    res.json(toRuleDto(updated));
  }),
);

rulesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const rule = await findRule(req.params.id, req.user!.orgId!);
    await prisma.rule.delete({ where: { id: rule.id } });
    res.status(204).end();
  }),
);

// Replaces the order of a rotation
rulesRouter.put(
  "/:id/rotation",
  asyncHandler(async (req, res) => {
    const { memberIds } = validate(rotationSchema, req.body);
    const orgId = req.user!.orgId!;

    const rule = await findRule(req.params.id, orgId);
    if (rule.type !== "ROTATION") {
      throw new HttpError(400, "Only rotation rules have a rotation order");
    }
    await assertInOrg(orgId, { memberIds });

    await prisma.$transaction([
      prisma.rotationSlot.deleteMany({ where: { ruleId: rule.id } }),
      prisma.rotationSlot.createMany({
        data: memberIds.map((memberId, position) => ({ ruleId: rule.id, memberId, position })),
      }),
    ]);

    res.json(toRuleDto(await findRule(rule.id, orgId)));
  }),
);

// Skips one occurrence, e.g. for a holiday. Saving a SKIPPED task means the
// scheduler finds the occurrence already exists, and leaves it alone.
rulesRouter.post(
  "/:id/skip",
  asyncHandler(async (req, res) => {
    const { date } = validate(skipSchema, req.body);
    const orgId = req.user!.orgId!;

    const rule = toRuleDto(await findRule(req.params.id, orgId));
    if (rule.type === "BIRTHDAY") {
      throw new HttpError(400, "Birthdays cannot be skipped");
    }
    if (!occursOn(rule, date)) {
      throw new HttpError(400, "This rule does not occur on that date");
    }

    const { timezone } = await getOrg(orgId);
    const task = await prisma.task.upsert({
      where: { occurrenceKey: `${rule.id}:${date}` },
      update: { status: "SKIPPED" },
      create: {
        ruleId: rule.id,
        orgId,
        title: rule.title,
        assigneeIds: [],
        dueAt: toInstant(date, rule.timeOfDay, timezone),
        status: "SKIPPED",
        occurrenceKey: `${rule.id}:${date}`,
      },
    });
    res.json(task);
  }),
);
