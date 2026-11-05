import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { formatDate } from "../lib/dates";
import { prisma } from "../lib/prisma";

// Routes for other services only. index.ts protects them with requireInternal,
// and the gateway does not forward /internal.
export const internalRouter = Router();

internalRouter.get(
  "/orgs",
  asyncHandler(async (_req, res) => {
    const orgs = await prisma.organisation.findMany({
      select: { id: true, name: true, timezone: true },
    });
    res.json(orgs);
  }),
);

internalRouter.get(
  "/orgs/:orgId/members",
  asyncHandler(async (req, res) => {
    const members = await prisma.membership.findMany({
      where: { orgId: req.params.orgId },
      include: {
        user: { select: { name: true, birthday: true, showBirthday: true } },
        groups: true,
        unavailability: true,
      },
      orderBy: { joinedAt: "asc" },
    });

    res.json(
      members.map((member) => ({
        membershipId: member.id,
        userId: member.userId,
        name: member.user.name,
        role: member.role,
        birthday: member.user.birthday ? formatDate(member.user.birthday) : null,
        showBirthday: member.user.showBirthday,
        groupIds: member.groups.map((group) => group.groupId),
        unavailability: member.unavailability.map(({ from, to }) => ({
          from: formatDate(from),
          to: formatDate(to),
        })),
      })),
    );
  }),
);

internalRouter.get(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true },
    });
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    res.json(user);
  }),
);
