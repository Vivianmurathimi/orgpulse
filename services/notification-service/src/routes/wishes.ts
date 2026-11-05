import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireOrg } from "../middleware/requireOrg";
import { getOrg } from "../lib/authClient";
import { formatDate, toDate, todayIn } from "../lib/dates";
import { prisma } from "../lib/prisma";
import { dateSchema, validate } from "../lib/validate";

export const wishesRouter = Router();

const querySchema = z.object({
  birthdayUserId: z.string().optional(),
  date: dateSchema.optional(),
});

// Wishes are sent over the socket (wish:send). This route loads the ones already sent.
wishesRouter.get(
  "/",
  requireOrg,
  asyncHandler(async (req, res) => {
    const { birthdayUserId, date } = validate(querySchema, req.query);
    const orgId = req.user!.orgId!;

    const day = date ?? todayIn((await getOrg(orgId)).timezone);

    const wishes = await prisma.wish.findMany({
      where: { orgId, birthdayUserId, birthdayDate: toDate(day) },
      orderBy: { createdAt: "asc" },
    });
    res.json(wishes.map((wish) => ({ ...wish, birthdayDate: formatDate(wish.birthdayDate) })));
  }),
);
