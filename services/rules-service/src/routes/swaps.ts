import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireOrg } from "../middleware/requireOrg";
import { publishEvent } from "../lib/events";
import { prisma } from "../lib/prisma";
import { validate } from "../lib/validate";

export const swapsRouter = Router();

const respondSchema = z.object({
  action: z.enum(["accept", "decline"], { error: "must be accept or decline" }),
});

// Swap requests still waiting for my answer
swapsRouter.get(
  "/open",
  requireOrg,
  asyncHandler(async (req, res) => {
    const { userId, orgId } = req.user!;
    const swaps = await prisma.swapRequest.findMany({
      where: { toId: userId, status: "OPEN", task: { orgId } },
    });
    res.json(swaps);
  }),
);

swapsRouter.patch(
  "/:id",
  requireOrg,
  asyncHandler(async (req, res) => {
    const { action } = validate(respondSchema, req.body);
    const { userId, orgId } = req.user!;

    const swap = await prisma.swapRequest.findFirst({
      where: { id: req.params.id, task: { orgId } },
      include: { task: true },
    });
    if (!swap) {
      throw new HttpError(404, "Swap request not found");
    }
    if (swap.toId !== userId) {
      throw new HttpError(403, "Only the person asked can respond to this swap");
    }
    if (swap.status !== "OPEN") {
      throw new HttpError(409, "This swap request has already been answered");
    }

    const { task } = swap;

    if (action === "decline") {
      const declined = await prisma.swapRequest.update({
        where: { id: swap.id },
        data: { status: "DECLINED" },
      });
      res.json(declined);
      return;
    }

    // The task may have changed since the swap was requested
    if (task.status !== "PENDING" || !task.assigneeIds.includes(swap.fromId)) {
      throw new HttpError(409, "This task can no longer be swapped");
    }

    const assigneeIds = task.assigneeIds.map((id) => (id === swap.fromId ? swap.toId : id));

    // Both changes succeed together, or neither does
    const [accepted] = await prisma.$transaction([
      prisma.swapRequest.update({ where: { id: swap.id }, data: { status: "ACCEPTED" } }),
      prisma.task.update({ where: { id: task.id }, data: { assigneeIds } }),
    ]);

    publishEvent("task.swapped", {
      orgId,
      taskId: task.id,
      title: task.title,
      fromId: swap.fromId,
      toId: swap.toId,
    });

    res.json(accepted);
  }),
);
