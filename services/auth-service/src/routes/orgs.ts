import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireMembership } from "../middleware/requireMembership";
import { requireUser } from "../middleware/requireUser";
import { generateInviteCode } from "../lib/inviteCode";
import { isUniqueViolation, prisma } from "../lib/prisma";
import { signToken } from "../lib/token";
import { validate } from "../lib/validate";

export const orgsRouter = Router();

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1, "is required").max(100),
  timezone: z
    .string()
    .refine(isValidTimezone, { error: "must be a timezone like Europe/Budapest" })
    .optional(),
});

const joinSchema = z.object({
  inviteCode: z.string().trim().toUpperCase().length(6, "must be 6 characters"),
});

// Creates the organisation and its first admin together, so we never end up
// with an organisation nobody can manage.
function createOrganisation(name: string, timezone: string | undefined, userId: string) {
  return prisma.organisation.create({
    data: {
      name,
      timezone,
      inviteCode: generateInviteCode(),
      memberships: { create: { userId, role: "ADMIN" } },
    },
  });
}

orgsRouter.post(
  "/",
  requireUser,
  asyncHandler(async (req, res) => {
    const { name, timezone } = validate(createSchema, req.body);
    const { userId } = req.user!;

    // A random code can clash with an existing one (very unlikely), so try a few times
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const org = await createOrganisation(name, timezone, userId);
        res.status(201).json({
          token: signToken({ userId, orgId: org.id, role: "ADMIN" }),
          organisation: org,
        });
        return;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new HttpError(500, "Could not create an invite code, please try again");
  }),
);

orgsRouter.post(
  "/join",
  requireUser,
  asyncHandler(async (req, res) => {
    const { inviteCode } = validate(joinSchema, req.body);
    const { userId } = req.user!;

    const org = await prisma.organisation.findUnique({ where: { inviteCode } });
    if (!org) {
      throw new HttpError(404, "No organisation has this invite code");
    }

    try {
      await prisma.membership.create({ data: { userId, orgId: org.id, role: "MEMBER" } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "You are already a member of this organisation");
      }
      throw err;
    }

    const { id, name, timezone } = org;
    res.status(201).json({
      token: signToken({ userId, orgId: id, role: "MEMBER" }),
      organisation: { id, name, timezone },
    });
  }),
);

orgsRouter.get(
  "/current",
  requireMembership,
  asyncHandler(async (req, res) => {
    const org = await prisma.organisation.findUniqueOrThrow({
      where: { id: req.membership!.orgId },
    });

    const { id, name, timezone, createdAt, inviteCode } = org;
    const isAdmin = req.membership!.role === "ADMIN";
    res.json({ id, name, timezone, createdAt, ...(isAdmin && { inviteCode }) });
  }),
);
