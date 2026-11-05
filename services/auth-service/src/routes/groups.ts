import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireAdmin, requireMembership } from "../middleware/requireMembership";
import { prisma } from "../lib/prisma";
import { validate } from "../lib/validate";

export const groupsRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(1, "is required").max(100),
});

const addMembersSchema = z.object({
  membershipIds: z.array(z.string()).min(1, "needs at least one member"),
});

groupsRouter.get(
  "/",
  requireMembership,
  asyncHandler(async (req, res) => {
    const groups = await prisma.group.findMany({
      where: { orgId: req.membership!.orgId },
      include: { members: true },
      orderBy: { name: "asc" },
    });

    res.json(
      groups.map(({ id, name, members }) => ({
        id,
        name,
        membershipIds: members.map((member) => member.membershipId),
      })),
    );
  }),
);

groupsRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name } = validate(createSchema, req.body);

    const group = await prisma.group.create({
      data: { name, orgId: req.membership!.orgId },
    });
    res.status(201).json({ id: group.id, name: group.name, membershipIds: [] });
  }),
);

groupsRouter.post(
  "/:id/members",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { membershipIds } = validate(addMembersSchema, req.body);
    const { orgId } = req.membership!;
    const groupId = req.params.id;

    const group = await prisma.group.findFirst({ where: { id: groupId, orgId } });
    if (!group) {
      throw new HttpError(404, "Group not found");
    }

    // Every member must belong to this organisation
    const uniqueIds = [...new Set(membershipIds)];
    const found = await prisma.membership.count({ where: { id: { in: uniqueIds }, orgId } });
    if (found !== uniqueIds.length) {
      throw new HttpError(400, "All members must belong to this organisation");
    }

    // skipDuplicates means adding someone twice is harmless
    await prisma.groupMember.createMany({
      data: uniqueIds.map((membershipId) => ({ groupId, membershipId })),
      skipDuplicates: true,
    });

    const members = await prisma.groupMember.findMany({ where: { groupId } });
    res.json({
      id: group.id,
      name: group.name,
      membershipIds: members.map((member) => member.membershipId),
    });
  }),
);
