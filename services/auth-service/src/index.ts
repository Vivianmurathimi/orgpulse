import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";
import { requireInternal } from "./middleware/requireInternal";
import { authRouter } from "./routes/auth";
import { groupsRouter } from "./routes/groups";
import { internalRouter } from "./routes/internal";
import { meRouter } from "./routes/me";
import { membersRouter } from "./routes/members";
import { orgsRouter } from "./routes/orgs";

const SERVICE = "auth-service";
const PORT = Number(process.env.PORT ?? 4001);

const app = express();
app.use(cors());
app.use(express.json());

// Health check — used by Docker and the gateway to see if the service is alive
app.get("/health", (_req, res) => {
  res.json({ service: SERVICE, status: "ok", time: new Date().toISOString() });
});

// More specific paths must come before the paths that contain them
app.use("/api/auth/me", meRouter);
app.use("/api/auth", authRouter);
app.use("/api/orgs/current/members", membersRouter);
app.use("/api/orgs/current/groups", groupsRouter);
app.use("/api/orgs", orgsRouter);
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
