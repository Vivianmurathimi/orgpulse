import type { User } from "../../generated/prisma";
import { formatDate } from "./dates";
import { prisma } from "./prisma";

// The safe version of a user for API responses. Never send passwordHash.
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    birthday: user.birthday ? formatDate(user.birthday) : null,
    showBirthday: user.showBirthday,
    createdAt: user.createdAt,
  };
}

// All organisations a user belongs to, oldest first
export async function listMemberships(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { organisation: true },
    orderBy: { joinedAt: "asc" },
  });

  return memberships.map((membership) => ({
    membershipId: membership.id,
    orgId: membership.orgId,
    orgName: membership.organisation.name,
    role: membership.role,
  }));
}
