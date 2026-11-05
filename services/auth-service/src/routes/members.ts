import { Router } from "express";
import { z } from "zod";
import type { Membership } from "../../generated/prisma";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireAdmin, requireMembership } from "../middleware/requireMembership";
import { formatDate } from "../lib/dates";
import { prisma } from "../lib/prisma";
import { validate } from "../lib/validate";

export const membersRouter = Router();

const roleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"], { error: "must be ADMIN or MEMBER" }),
});

async function findMemberInOrg(membershipId: string, orgId: string): Promise<Membership> {
  // Checking orgId stops an admin from changing members of another organisation
  const member = await prisma.membership.findFirst({ where: { id: membershipId, orgId } });
  if (!member) {
    throw new HttpError(404, "Member not found");
  }
  return member;
}

// Every organisation needs at least one admin
async function assertNotLastAdmin(member: Membership): Promise<void> {
  if (member.role !== "ADMIN") return;

  const admins = await prisma.membership.count({
    where: { orgId: member.orgId, role: "ADMIN" },
  });
  if (admins === 1) {
    throw new HttpError(400, "An organisation must keep at least one admin");
  }
}

membersRouter.get(
  "/",
  requireMembership,
  asyncHandler(async (req, res) => {
    const members = await prisma.membership.findMany({
      where: { orgId: req.membership!.orgId },
      include: {
        user: { select: { name: true, birthday: true, showBirthday: true } },
        groups: { include: { group: true } },
      },
      orderBy: { joinedAt: "asc" },
    });

    res.json(
      members.map((member) => {
        // A hidden birthday stays visible only to the person it belongs to
        const canSeeBirthday = member.user.showBirthday || member.userId === req.user!.userId;
        const birthday = member.user.birthday;

        return {
          membershipId: member.id,
          userId: member.userId,
          name: member.user.name,
          role: member.role,
          birthday: canSeeBirthday && birthday ? formatDate(birthday) : null,
          groups: member.groups.map(({ group }) => ({ id: group.id, name: group.name })),
        };
      }),
    );
  }),
);

membersRouter.patch(
  "/:membershipId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { role } = validate(roleSchema, req.body);
    const member = await findMemberInOrg(req.params.membershipId, req.membership!.orgId);

    if (role === "MEMBER") {
      await assertNotLastAdmin(member);
    }

    const updated = await prisma.membership.update({ where: { id: member.id }, data: { role } });
    res.json({ membershipId: updated.id, userId: updated.userId, role: updated.role });
  }),
);

membersRouter.delete(
  "/:membershipId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const member = await findMemberInOrg(req.params.membershipId, req.membership!.orgId);
    await assertNotLastAdmin(member);

    await prisma.membership.delete({ where: { id: member.id } });
    res.status(204).end();
  }),
);
