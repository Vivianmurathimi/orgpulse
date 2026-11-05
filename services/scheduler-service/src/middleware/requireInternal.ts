import type { RequestHandler } from "express";
import { HttpError } from "./errorHandler";

// Protects /internal/* routes: only other services know the shared secret.
// If INTERNAL_KEY is not configured, every request is refused.
export const requireInternal: RequestHandler = (req, _res, next) => {
  const expected = process.env.INTERNAL_KEY;
  if (!expected || req.header("x-internal-key") !== expected) {
    next(new HttpError(403, "Internal route"));
    return;
  }
  next();
};
