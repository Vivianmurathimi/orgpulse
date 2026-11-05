import type { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { createProxyMiddleware } from "http-proxy-middleware";
import { config } from "./config";

// Runs when a service cannot be reached: answer in our normal JSON error format
function onProxyError(err: Error, req: IncomingMessage, res: ServerResponse | Socket) {
  console.error(`Proxy error for ${req.method} ${req.url?.split("?")[0]}: ${err.message}`);

  if (res instanceof Socket || res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(503, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Service temporarily unavailable" }));
}

// Creates a proxy that forwards the listed path prefixes to one service.
// pathFilter keeps the full path, so /api/rules/1 arrives at the service unchanged.
function proxyTo(target: string, paths: string[]) {
  return createProxyMiddleware({
    target,
    pathFilter: paths,
    changeOrigin: true,
    proxyTimeout: 10_000,
    on: {
      error: onProxyError,
      // The gateway decides CORS, so drop the header the service sent
      proxyRes: (proxyRes) => {
        delete proxyRes.headers["access-control-allow-origin"];
      },
    },
  });
}

export const proxies = [
  proxyTo(config.services.auth, ["/api/auth", "/api/orgs"]),
  proxyTo(config.services.rules, ["/api/rules", "/api/tasks", "/api/swaps"]),
  proxyTo(config.services.notification, ["/api/notifications", "/api/preferences", "/api/wishes"]),
  proxyTo(config.services.scheduler, ["/api/scheduler"]),
];
