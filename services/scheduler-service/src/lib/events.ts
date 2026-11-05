import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { prisma } from "./prisma";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 1, // fail instead of waiting forever if Redis is down
  retryStrategy: (attempt) => Math.min(attempt * 500, 5000), // keep reconnecting
});

// Without this listener a lost connection would crash the service
redis.on("error", (err) => console.error(`Redis error: ${err.message}`));

// Publishes an event only if this key has never been sent.
// Returns true if it was sent, false if it had been sent before.
export async function fireOnce(
  eventKey: string,
  orgId: string,
  channel: string,
  payload: object,
): Promise<boolean> {
  // Claim the key first. If it already exists, this run has nothing to do.
  const { count } = await prisma.firedEvent.createMany({
    data: [{ eventKey, orgId }],
    skipDuplicates: true,
  });
  if (count === 0) return false;

  try {
    await redis.publish(channel, JSON.stringify({ eventId: randomUUID(), orgId, ...payload }));
    return true;
  } catch (err) {
    // Nothing was sent, so release the key. The next run will try again.
    await prisma.firedEvent.delete({ where: { eventKey } });
    throw err;
  }
}
