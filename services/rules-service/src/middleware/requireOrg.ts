import type { RequestHandler } from "express";
import { HttpError } from "./errorHandler";
import { requireUser } from "./requireUser";

const checkOrg: RequestHandler = (req, _res, next) => {
  if (!req.user?.orgId) {
    next(new HttpError(403, "Create or join an organisation first"));
    return;
  }
  next();
};

const checkAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== "ADMIN") {
    next(new HttpError(403, "Admin access required"));
    return;
  }
  next();
};

// Use these on routes. After them, req.user.orgId is always set.
export const requireOrg = [requireUser, checkOrg];
export const requireAdmin = [requireUser, checkOrg, checkAdmin];
