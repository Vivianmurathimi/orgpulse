import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";
import { requireInternal } from "./middleware/requireInternal";
import { internalRouter } from "./routes/internal";
import { rulesRouter } from "./routes/rules";
import { swapsRouter } from "./routes/swaps";
import { tasksRouter } from "./routes/tasks";

const SERVICE = "rules-service";
const PORT = Number(process.env.PORT ?? 4002);

const app = express();
app.use(cors());
app.use(express.json());

// Health check — used by Docker and the gateway to see if the service is alive
app.get("/health", (_req, res) => {
  res.json({ service: SERVICE, status: "ok", time: new Date().toISOString() });
});

app.use("/api/rules", rulesRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/swaps", swapsRouter);
app.use("/internal", requireInternal, internalRouter);

// No route matched
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Must stay last, so it catches errors from every route above
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[${SERVICE}] listening on http://localhost:${PORT}`);
});
