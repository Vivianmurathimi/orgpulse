import type { Category, Preference } from "../../generated/prisma";
import { emitToUser } from "../realtime";
import { getOrg } from "./authClient";
import { timeIn } from "./dates";
import { prisma } from "./prisma";
import { isQuietTime } from "./quietHours";

export interface Draft {
  userId: string;
  category: Category;
  title: string;
  message: string;
  data?: Record<string, string>;
}

// Quiet hours use the organisation's timezone. If that can't be found right now,
// sending the notification is better than losing it.
async function currentTime(orgId: string): Promise<string | null> {
  try {
    const { timezone } = await getOrg(orgId);
    return timeIn(timezone);
  } catch {
    return null;
  }
}

function wantsPush(
  preference: Preference | undefined,
  category: Category,
  time: string | null,
): boolean {
  if (!preference) return true;
  if (preference.mutedCategories.includes(category)) return false;
  return !time || !isQuietTime(preference.quietFrom, preference.quietTo, time);
}

// Saves one notification per person, then pushes it to those who want it now.
// Muted or quiet notifications are saved but not pushed, so they stay in the history.
export async function notify(orgId: string, eventId: string, drafts: Draft[]): Promise<void> {
  // skipDuplicates uses the (userId, eventId) rule. Only new rows come back,
  // so an event delivered twice is not pushed twice.
  const created = await prisma.notification.createManyAndReturn({
    data: drafts.map((draft) => ({ ...draft, orgId, eventId })),
    skipDuplicates: true,
  });
  if (created.length === 0) return;

  const preferences = await prisma.preference.findMany({
    where: { userId: { in: created.map((row) => row.userId) } },
  });
  const preferenceOf = new Map(preferences.map((item) => [item.userId, item]));

  const needsTime = preferences.some((item) => item.quietFrom && item.quietTo);
  const time = needsTime ? await currentTime(orgId) : null;

  for (const notification of created) {
    if (wantsPush(preferenceOf.get(notification.userId), notification.category, time)) {
      emitToUser(notification.userId, "notification:new", notification);
    }
  }
}
