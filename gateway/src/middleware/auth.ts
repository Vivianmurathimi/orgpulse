import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";

// These paths work without a token
const PUBLIC_PATHS = ["/health", "/status", "/api/auth/register", "/api/auth/login"];

// Headers that services trust. Only the gateway may set them.
const TRUSTED_HEADERS = ["x-user-id", "x-org-id", "x-user-role", "x-internal-key"];

interface TokenPayload {
  userId: string;
  orgId?: string;
  role?: string;
}

// Remove trusted headers sent by the client, so nobody can pretend to be another user
export const stripTrustedHeaders: RequestHandler = (req, _res, next) => {
  for (const header of TRUSTED_HEADERS) {
    delete req.headers[header];
  }
  next();
};

// Returns the token's contents, or null if it is missing, expired or forged
function readToken(authorization: string | undefined): TokenPayload | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  try {
    const payload = jwt.verify(authorization.slice("Bearer ".length), config.jwtSecret, {
      algorithms: ["HS256"],
    });
    if (typeof payload === "string" || typeof payload.userId !== "string") {
      return null;
    }
    return { userId: payload.userId, orgId: payload.orgId, role: payload.role };
  } catch {
    return null;
  }
}

// Verify the JWT, then pass the user's identity on to the services as headers
export const verifyToken: RequestHandler = (req, res, next) => {
  if (PUBLIC_PATHS.includes(req.path)) {
    next();
    return;
  }

  const user = readToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }

  req.headers["x-user-id"] = user.userId;
  if (user.orgId) req.headers["x-org-id"] = user.orgId;
  if (user.role) req.headers["x-user-role"] = user.role;
  next();
};

// Only admins may use the scheduler routes
export const requireAdminForScheduler: RequestHandler = (req, res, next) => {
  if (req.path.startsWith("/api/scheduler") && req.headers["x-user-role"] !== "ADMIN") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
};
