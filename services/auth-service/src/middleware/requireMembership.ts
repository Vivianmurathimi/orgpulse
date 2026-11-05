import type { RequestHandler } from "express";
import type { Membership } from "../../generated/prisma";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "./asyncHandler";
import { HttpError } from "./errorHandler";
import { requireUser } from "./requireUser";

declare global {
  namespace Express {
    interface Request {
      membership?: Membership;
    }
  }
}

// Loads the user's membership of their current organisation.
// A JWT lasts 7 days, so it can be out of date: this service owns memberships,
// so it checks the database. A removed member is refused straight away.
const loadMembership = asyncHandler(async (req, _res, next) => {
  const { userId, orgId } = req.user!; // requireUser runs first
  if (!orgId) {
    throw new HttpError(403, "Create or join an organisation first");
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!membership) {
    throw new HttpError(403, "You are not a member of this organisation");
  }

  req.membership = membership;
  next();
});

const checkAdmin: RequestHandler = (req, _res, next) => {
  if (req.membership?.role !== "ADMIN") {
    next(new HttpError(403, "Admin access required"));
    return;
  }
  next();
};

export const requireMembership = [requireUser, loadMembership];
export const requireAdmin = [requireUser, loadMembership, checkAdmin];
