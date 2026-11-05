import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";

const SERVICE = "notification-service";
const PORT = Number(process.env.PORT ?? 4004);

const app = express();
app.use(cors());
app.use(express.json());

// Health check — used by Docker and the gateway to see if the service is alive
app.get("/health", (_req, res) => {
  res.json({ service: SERVICE, status: "ok", time: new Date().toISOString() });
});

// Must stay last, so it catches errors from every route above
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[${SERVICE}] listening on http://localhost:${PORT}`);
});
