import type { ErrorRequestHandler } from "express";

// Throw this from a route to send a specific status code to the client,
// e.g. throw new HttpError(404, "Rule not found")
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Central error handler: every error becomes a JSON { error: string } response.
// Express recognises it as an error handler because it takes 4 arguments.
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // express.json() raises an error with status 400 when the body is invalid JSON
  if (err instanceof SyntaxError && "status" in err && err.status === 400) {
    res.status(400).json({ error: "Request body is not valid JSON" });
    return;
  }

  // Anything else is a bug: log it, but don't show the details to the client
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
