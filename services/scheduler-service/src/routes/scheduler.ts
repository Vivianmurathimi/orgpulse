import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireAdmin } from "../middleware/requireOrg";
import { runScheduler } from "../engine";
import { dateIn } from "../lib/dates";
import { addDays, toInstant } from "../lib/occurrences";
import { prisma } from "../lib/prisma";
import { getOrgs, resetTasks } from "../lib/services";
import { runInTurn } from "../queue";

export const schedulerRouter = Router();

// The gateway already checks for admins. This also protects direct calls.
schedulerRouter.use(requireAdmin);

// The "Run scheduler now" button: runs the admin's own organisation immediately
schedulerRouter.post(
  "/run",
  asyncHandler(async (req, res) => {
    const orgId = req.user!.orgId!;
    res.json(await runInTurn(() => runScheduler(new Date(), { orgId })));
  }),
);

// Development only: forget what was sent today, so the demo can be run again
schedulerRouter.post(
  "/reset-today",
  asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      throw new HttpError(403, "Not available in production");
    }

    const orgId = req.user!.orgId!;
    const org = (await getOrgs()).find(({ id }) => id === orgId);
    if (!org) {
      throw new HttpError(404, "Organisation not found");
    }

    const today = dateIn(org.timezone, new Date());
    const startOfToday = toInstant(today, "00:00", org.timezone);
    const startOfTomorrow = toInstant(addDays(today, 1), "00:00", org.timezone);

    const result = await runInTurn(async () => {
      const { count } = await prisma.firedEvent.deleteMany({
        where: { orgId, firedAt: { gte: startOfToday } },
      });
      const tasks = await resetTasks(orgId, startOfToday, startOfTomorrow);
      return { eventsCleared: count, tasksReset: tasks.count };
    });

    res.json(result);
  }),
);
