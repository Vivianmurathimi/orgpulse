import { z } from "zod";
import { HttpError } from "../middleware/errorHandler";
import type { SocketUser } from "../realtime";
import { getMembers, getOrg } from "./authClient";
import { formatDate, isBirthdayOn, toDate, todayIn } from "./dates";
import { prisma } from "./prisma";
import { validate } from "./validate";

const wishSchema = z.object({
  birthdayUserId: z.string().min(1, "is required"),
  text: z.string().trim().min(1, "cannot be empty").max(500, "must be at most 500 characters"),
});

// The sender's identity always comes from their token, never from the message,
// so nobody can send a wish in someone else's name.
export async function sendWish(user: SocketUser, data: unknown) {
  const { birthdayUserId, text } = validate(wishSchema, data);
  const { userId, orgId } = user;
  if (!orgId) {
    throw new HttpError(403, "Create or join an organisation first");
  }

  // Tokens last 7 days, so check the sender is still a member
  const members = await getMembers(orgId);
  const sender = members.find((member) => member.userId === userId);
  if (!sender) {
    throw new HttpError(403, "You are not a member of this organisation");
  }

  const { timezone } = await getOrg(orgId);
  const today = todayIn(timezone);

  const person = members.find((member) => member.userId === birthdayUserId);
  if (!person?.birthday || !person.showBirthday || !isBirthdayOn(person.birthday, today)) {
    throw new HttpError(400, "It is not this person's birthday today");
  }

  const wish = await prisma.wish.create({
    data: {
      orgId,
      birthdayUserId,
      birthdayDate: toDate(today),
      fromUserId: userId,
      fromName: sender.name,
      text,
    },
  });
  return { ...wish, birthdayDate: formatDate(wish.birthdayDate) };
}
