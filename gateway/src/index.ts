import express from "express";
import cors from "cors";
import { config } from "./config";
import { requestLogger } from "./middleware/requestLogger";
import {
  requireAdminForScheduler,
  stripTrustedHeaders,
  verifyToken,
} from "./middleware/auth";
import { statusRouter } from "./routes/status";
import { proxies } from "./proxy";

const SERVICE = "gateway";

const app = express();

// Do NOT add express.json() here. It would read the request body,
// leaving nothing for the proxy to forward to the services.

// The order matters: security checks run before anything is forwarded
app.use(requestLogger);
app.use(cors({ origin: config.clientOrigin }));
app.use(stripTrustedHeaders);
app.use(verifyToken);
app.use(requireAdminForScheduler);

app.get("/health", (_req, res) => {
  res.json({ service: SERVICE, status: "ok", time: new Date().toISOString() });
});
app.use(statusRouter);

app.use(proxies);

// No route matched
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(config.port, () => {
  console.log(`[${SERVICE}] listening on http://localhost:${config.port}`);
});
