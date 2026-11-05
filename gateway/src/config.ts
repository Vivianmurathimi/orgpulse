// All gateway settings in one place, read from the environment.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Without these the gateway cannot work safely, so stop with a clear message
    throw new Error(`Missing environment variable ${name}. Did you run "npm run setup:env"?`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  jwtSecret: requireEnv("JWT_SECRET"),
  clientOrigin: requireEnv("CLIENT_ORIGIN"),
  services: {
    auth: requireEnv("AUTH_SERVICE_URL"),
    rules: requireEnv("RULES_SERVICE_URL"),
    scheduler: requireEnv("SCHEDULER_SERVICE_URL"),
    notification: requireEnv("NOTIFICATION_SERVICE_URL"),
  },
};
