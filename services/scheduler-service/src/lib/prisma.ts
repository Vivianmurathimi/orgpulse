import { PrismaClient } from "../../generated/prisma";

// One shared database client for the whole service
export const prisma = new PrismaClient();
