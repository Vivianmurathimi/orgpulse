import type { RequestHandler } from "express";

// Logs one line per request, e.g. "POST /api/auth/login 200 12ms".
// Query strings and headers are left out so tokens can never end up in the logs.
export const requestLogger: RequestHandler = (req, res, next) => {
  const started = Date.now();
  const { method, path } = req;

  res.on("finish", () => {
    console.log(`${method} ${path} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
};
