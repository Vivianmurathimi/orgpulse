import type { RequestHandler } from "express";
import { HttpError } from "./errorHandler";

export type Role = "ADMIN" | "MEMBER";

export interface RequestUser {
  userId: string;
  orgId?: string; // missing until the user has created or joined an organisation
  role?: Role;
}

// Tell TypeScript that Express requests can carry a `user` property
declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

// The gateway verifies the JWT and forwards who the user is in these headers.
// Services trust the headers, and only the gateway can reach them in production.
export const requireUser: RequestHandler = (req, _res, next) => {
  const userId = req.header("x-user-id");
  if (!userId) {
    next(new HttpError(401, "Not authenticated"));
    return;
  }

  const role = req.header("x-user-role");
  req.user = {
    userId,
    orgId: req.header("x-org-id") || undefined,
    role: role === "ADMIN" || role === "MEMBER" ? role : undefined,
  };
  next();
};
