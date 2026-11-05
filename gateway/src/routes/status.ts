import { Router } from "express";
import { config } from "../config";

export const statusRouter = Router();

// Asks one service for its /health. A slow or stopped service counts as "down".
async function checkService(url: string): Promise<"up" | "down"> {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok ? "up" : "down";
  } catch {
    return "down";
  }
}

// GET /status shows which services are running
statusRouter.get("/status", async (_req, res) => {
  const names = Object.keys(config.services) as (keyof typeof config.services)[];

  // Check every service at the same time, so one slow service doesn't delay the others
  const results = await Promise.all(names.map((name) => checkService(config.services[name])));
  const services = Object.fromEntries(names.map((name, i) => [name, results[i]]));

  res.json({
    status: results.every((result) => result === "up") ? "ok" : "degraded",
    services,
  });
});
