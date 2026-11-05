// Sends a fake "duty is due" event to Redis, addressed to Grace, so you can watch
// a notification arrive without the scheduler. Each run is a new event.
// Needs Redis and the auth service running, and the demo data seeded.
//   npm run test:publish -w notification-service
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { HttpError } from "./middleware/errorHandler";
import { getMembers } from "./lib/authClient";

interface OrgRow {
  id: string;
  name: string;
}

async function main() {
  const response = await fetch(`${process.env.AUTH_SERVICE_URL}/internal/orgs`, {
    headers: { "x-internal-key": process.env.INTERNAL_KEY ?? "" },
  });
  const orgs = (await response.json()) as OrgRow[];

  const org = orgs.find(({ name }) => name === "Grace Church");
  if (!org) {
    throw new Error('Grace Church not found. Run "npm run seed -w auth-service" first.');
  }

  const grace = (await getMembers(org.id)).find(({ name }) => name === "Grace");
  if (!grace) {
    throw new Error("Grace is not a member of Grace Church");
  }

  const event = {
    eventId: randomUUID(),
    orgId: org.id,
    ruleId: "test-rule",
    taskId: randomUUID(),
    assigneeIds: [grace.userId],
    title: "Test duty",
    dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const listeners = await redis.publish("due.task", JSON.stringify(event));
  await redis.quit();

  console.log(`Published due.task for Grace (${listeners} service(s) listening)`);
}

main().catch((err) => {
  console.error(err instanceof HttpError || err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
