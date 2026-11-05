import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";
import { startSubscriber } from "./lib/subscriber";
import { startRealtime } from "./realtime";
import { notificationsRouter } from "./routes/notifications";
import { preferencesRouter } from "./routes/preferences";
import { wishesRouter } from "./routes/wishes";

const SERVICE = "notification-service";
const PORT = Number(process.env.PORT ?? 4004);

const app = express();
app.use(cors());
app.use(express.json());

// Health check — used by Docker and the gateway to see if the service is alive
app.get("/health", (_req, res) => {
  res.json({ service: SERVICE, status: "ok", time: new Date().toISOString() });
});

app.use("/api/notifications", notificationsRouter);
app.use("/api/preferences", preferencesRouter);
app.use("/api/wishes", wishesRouter);

// No route matched
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Must stay last, so it catches errors from every route above
app.use(errorHandler);

// Express and Socket.IO share one HTTP server, and so one port
const server = createServer(app);
startRealtime(server);
startSubscriber();

server.listen(PORT, () => {
  console.log(`[${SERVICE}] listening on http://localhost:${PORT}`);
});
