import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireOrg } from "../middleware/requireOrg";
import { prisma } from "../lib/prisma";

export const notificationsRouter = Router();

const HISTORY_LIMIT = 100;

notificationsRouter.use(requireOrg);

notificationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { userId, orgId } = req.user!;

    const notifications = await prisma.notification.findMany({
      where: { userId, orgId, ...(req.query.unread === "true" && { read: false }) },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
    });
    res.json(notifications);
  }),
);

notificationsRouter.get(
  "/unread-count",
  asyncHandler(async (req, res) => {
    const { userId, orgId } = req.user!;
    const count = await prisma.notification.count({ where: { userId, orgId, read: false } });
    res.json({ count });
  }),
);

notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const { userId, orgId } = req.user!;
    const { count } = await prisma.notification.updateMany({
      where: { userId, orgId, read: false },
      data: { read: true },
    });
    res.json({ count });
  }),
);

notificationsRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    // Checking userId means people can only change their own notifications
    const { count } = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data: { read: true },
    });
    if (count === 0) {
      throw new HttpError(404, "Notification not found");
    }
    res.json({ id: req.params.id, read: true });
  }),
);
