// Copies each .env.example to .env, unless that .env already exists.
// Existing .env files are never overwritten, so it is safe to run this twice.
import { copyFileSync, existsSync } from "node:fs";

const folders = [
  "gateway",
  "services/auth-service",
  "services/rules-service",
  "services/scheduler-service",
  "services/notification-service",
];

for (const folder of folders) {
  const example = `${folder}/.env.example`;
  const target = `${folder}/.env`;

  if (existsSync(target)) {
    console.log(`skipped  ${target} (already exists)`);
  } else {
    copyFileSync(example, target);
    console.log(`created  ${target}`);
  }
}
