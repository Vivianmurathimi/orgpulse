import express from "express";
import cors from "cors";

const SERVICE = "gateway";
const PORT = Number(process.env.PORT ?? 8080);

const app = express();
app.use(cors());

// Health check. JWT checks and proxy routes are added in Phase 2.
app.get("/health", (_req, res) => {
  res.json({ service: SERVICE, status: "ok", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[${SERVICE}] listening on http://localhost:${PORT}`);
});
