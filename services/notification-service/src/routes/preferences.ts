import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireUser } from "../middleware/requireUser";
import { prisma } from "../lib/prisma";
import { validate } from "../lib/validate";

export const preferencesRouter = Router();

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must look like 22:00")
  .nullable();

const preferenceSchema = z
  .object({
    quietFrom: time,
    quietTo: time,
    mutedCategories: z.array(
      z.enum(["BIRTHDAY", "TASK", "REMINDER", "SWAP", "STATUS"], {
        error: "must be BIRTHDAY, TASK, REMINDER, SWAP or STATUS",
      }),
    ),
  })
  .refine(({ quietFrom, quietTo }) => (quietFrom === null) === (quietTo === null), {
    error: "Quiet hours need both a start and an end",
  });

preferencesRouter.use(requireUser);

preferencesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId } = req.user!;
    const preference = await prisma.preference.findUnique({ where: { userId } });

    res.json(preference ?? { userId, quietFrom: null, quietTo: null, mutedCategories: [] });
  }),
);

preferencesRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const { userId } = req.user!;
    const body = validate(preferenceSchema, req.body);
    const mutedCategories = [...new Set(body.mutedCategories)];
    const data = { quietFrom: body.quietFrom, quietTo: body.quietTo, mutedCategories };

    const preference = await prisma.preference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    res.json(preference);
  }),
);
