import { Redis } from "ioredis";
import { HttpError } from "../middleware/errorHandler";
import { handlers } from "./eventHandlers";

const RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Handling an event is safe to repeat, because notifications can't be duplicated.
// So if something fails (e.g. auth is restarting), simply try again.
async function handleWithRetry(channel: string, raw: unknown): Promise<void> {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      await handlers[channel](raw);
      return;
    } catch (err) {
      // A malformed event will never become valid, so don't retry those
      if (err instanceof HttpError && err.status === 400) {
        console.error(`Ignored bad ${channel} event: ${err.message}`);
        return;
      }
      console.error(`Handling ${channel} failed (try ${attempt}/${RETRIES}):`, err);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  console.error(`Gave up on a ${channel} event`);
}

export function startSubscriber(): void {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000), // keep reconnecting
  });

  // Without this listener a lost connection would crash the service.
  // ioredis reconnects and subscribes again by itself.
  redis.on("error", (err) => console.error(`Redis error: ${err.message}`));

  redis.on("message", (channel, message) => {
    let raw: unknown;
    try {
      raw = JSON.parse(message);
    } catch {
      console.error(`Ignored a ${channel} event that is not valid JSON`);
      return;
    }
    void handleWithRetry(channel, raw);
  });

  redis.subscribe(...Object.keys(handlers)).catch((err) => {
    console.error(`Redis subscribe failed: ${err.message}`);
  });
}
