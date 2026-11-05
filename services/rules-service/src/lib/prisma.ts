import { Prisma, PrismaClient } from "../../generated/prisma";

// One shared database client for the whole service
export const prisma = new PrismaClient();

// True when a save failed because a unique value (e.g. an email) already exists
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
