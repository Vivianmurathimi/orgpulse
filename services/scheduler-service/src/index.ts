import express from "express";
import cors from "cors";
import cron from "node-cron";
import { runScheduler } from "./engine";
import { errorHandler } from "./middleware/errorHandler";
import { runInTurn } from "./queue";
import { schedulerRouter } from "./routes/scheduler";

const SERVICE = "scheduler-service";
const PORT = Number(process.env.PORT ?? 4003);

const app = express();
app.use(cors());
app.use(express.json());

// Health check — used by Docker and the gateway to see if the service is alive
app.get("/health", (_req, res) => {
  res.json({ service: SERVICE, status: "ok", time: new Date().toISOString() });
});

app.use("/api/scheduler", schedulerRouter);

// No route matched
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Must stay last, so it catches errors from every route above
app.use(errorHandler);

// The timer. A failed run is only logged: the next one tries again.
function startTimer() {
  const schedule = process.env.SCHEDULER_CRON ?? "* * * * *";

  if (process.env.SCHEDULER_ENABLED === "false") {
    console.log(`[${SERVICE}] timer disabled, use POST /api/scheduler/run`);
    return;
  }
  if (!cron.validate(schedule)) {
    console.error(`[${SERVICE}] invalid SCHEDULER_CRON "${schedule}", timer not started`);
    return;
  }

  cron.schedule(schedule, () => {
    runInTurn(() => runScheduler(new Date())).catch((err) => {
      console.error(`Scheduler run failed: ${err.message}`);
    });
  });
  console.log(`[${SERVICE}] timer running: ${schedule}`);
}

app.listen(PORT, () => {
  console.log(`[${SERVICE}] listening on http://localhost:${PORT}`);
  startTimer();
});
