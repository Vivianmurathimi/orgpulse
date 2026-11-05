import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireMembership } from "../middleware/requireMembership";
import { requireUser } from "../middleware/requireUser";
import { formatDate, toDate } from "../lib/dates";
import { prisma } from "../lib/prisma";
import { listMemberships, toPublicUser } from "../lib/users";
import { birthdaySchema, dateSchema, validate } from "../lib/validate";

export const meRouter = Router();

const updateSchema = z.object({
  name: z.string().trim().min(1, "cannot be empty").max(100).optional(),
  birthday: birthdaySchema.nullable().optional(), // null removes the birthday
  showBirthday: z.boolean().optional(),
});

const unavailableSchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine(({ from, to }) => from <= to, { error: "from must not be after to" });

meRouter.get(
  "/",
  requireUser,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    res.json({ user: toPublicUser(user), memberships: await listMemberships(user.id) });
  }),
);

meRouter.patch(
  "/",
  requireUser,
  asyncHandler(async (req, res) => {
    const { name, birthday, showBirthday } = validate(updateSchema, req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        name,
        showBirthday,
        // undefined leaves the birthday as it is, null clears it
        birthday: birthday ? toDate(birthday) : birthday,
      },
    });
    res.json({ user: toPublicUser(user) });
  }),
);

// Unavailable dates belong to a membership, so they apply to the current organisation

meRouter.get(
  "/unavailable",
  requireMembership,
  asyncHandler(async (req, res) => {
    const periods = await prisma.unavailability.findMany({
      where: { membershipId: req.membership!.id },
      orderBy: { from: "asc" },
    });
    res.json(
      periods.map(({ id, from, to }) => ({ id, from: formatDate(from), to: formatDate(to) })),
    );
  }),
);

meRouter.post(
  "/unavailable",
  requireMembership,
  asyncHandler(async (req, res) => {
    const { from, to } = validate(unavailableSchema, req.body);

    const period = await prisma.unavailability.create({
      data: { membershipId: req.membership!.id, from: toDate(from), to: toDate(to) },
    });
    res.status(201).json({ id: period.id, from, to });
  }),
);

meRouter.delete(
  "/unavailable/:id",
  requireMembership,
  asyncHandler(async (req, res) => {
    // The membershipId check means users can only delete their own periods
    const { count } = await prisma.unavailability.deleteMany({
      where: { id: req.params.id, membershipId: req.membership!.id },
    });
    if (count === 0) {
      throw new HttpError(404, "Unavailable period not found");
    }
    res.status(204).end();
  }),
);
