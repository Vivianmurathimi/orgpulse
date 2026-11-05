import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { HttpError } from "../middleware/errorHandler";
import { requireUser } from "../middleware/requireUser";
import { isUniqueViolation, prisma } from "../lib/prisma";
import { signToken } from "../lib/token";
import { listMemberships, toPublicUser } from "../lib/users";
import { birthdaySchema, validate } from "../lib/validate";
import { toDate } from "../lib/dates";

export const authRouter = Router();

const PASSWORD_ROUNDS = 10;

const email = z.email("must be a valid email address").transform((text) => text.toLowerCase());

const registerSchema = z.object({
  email,
  // bcrypt only uses the first 72 bytes of a password
  password: z.string().min(8, "must be at least 8 characters").max(72, "must be at most 72 characters"),
  name: z.string().trim().min(1, "is required").max(100),
  birthday: birthdaySchema.optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, "is required"),
});

const switchOrgSchema = z.object({
  orgId: z.string().min(1, "is required"),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password, name, birthday } = validate(registerSchema, req.body);
    const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);

    try {
      const user = await prisma.user.create({
        data: { email, passwordHash, name, birthday: birthday ? toDate(birthday) : undefined },
      });
      res.status(201).json({ token: signToken({ userId: user.id }), user: toPublicUser(user) });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "An account with this email already exists");
      }
      throw err;
    }
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = validate(loginSchema, req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    const passwordMatches = user && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !passwordMatches) {
      // Same message for both cases, so nobody can test which emails exist here
      throw new HttpError(401, "Wrong email or password");
    }

    // Start in the user's oldest organisation, if they have one
    const memberships = await listMemberships(user.id);
    const first = memberships[0];
    const token = signToken({ userId: user.id, orgId: first?.orgId, role: first?.role });

    res.json({ token, user: toPublicUser(user), memberships });
  }),
);

authRouter.post(
  "/switch-org",
  requireUser,
  asyncHandler(async (req, res) => {
    const { orgId } = validate(switchOrgSchema, req.body);
    const { userId } = req.user!;

    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });
    if (!membership) {
      throw new HttpError(403, "You are not a member of this organisation");
    }

    res.json({ token: signToken({ userId, orgId, role: membership.role }) });
  }),
);
