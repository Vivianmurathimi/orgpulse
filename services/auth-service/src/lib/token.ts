import jwt from "jsonwebtoken";

export interface TokenPayload {
  userId: string;
  orgId?: string; // the organisation the user is currently working in
  role?: string;
}

export function signToken(payload: TokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}
