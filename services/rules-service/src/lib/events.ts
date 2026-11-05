import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";

// Publishes events to Redis for other services. Saving to the database always
// comes first, so a Redis problem must never make a user's request fail.

const RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let redis: Redis | undefined;

// Connect on first use, so the seed script and tests never open a connection
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1, // wait through one reconnect, then let publishEvent retry
      retryStrategy: (attempt) => Math.min(attempt * 500, 5000), // keep reconnecting
    });
    // Without this listener a lost connection would crash the service
    redis.on("error", (err) => console.error(`Redis error: ${err.message}`));
  }
  return redis;
}

// Runs in the background: callers don't wait for it, and it never throws.
export function publishEvent(channel: string, payload: object): void {
  // Consumers use eventId to ignore duplicates
  const message = JSON.stringify({ eventId: randomUUID(), ...payload });

  void (async () => {
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        await getRedis().publish(channel, message);
        return;
      } catch (err) {
        console.error(`Publish to ${channel} failed (try ${attempt}/${RETRIES}): ${err}`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
    console.error(`Gave up publishing to ${channel}`);
  })();
}
