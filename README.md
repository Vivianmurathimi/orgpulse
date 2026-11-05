# OrgPulse

**Smart notifications for organisations — rules instead of calendar entries.**

OrgPulse lets churches, clubs, schools and teams define recurring duties once (birthdays, cleaning rotas, ushering rosters, assignments). The system works out what is due today and for whom, and notifies only the right people in real time — so nobody's calendar fills up with hundreds of entries.

## Documentation

| Document | What it covers |
|---|---|
| [Project Proposal](docs/proposal.md) | Problem, idea, use cases, scope, demo plan |
| [Architecture](docs/architecture.md) | The 4 microservices, communication, data model, key flows (Mermaid diagrams) |
| [User Stories & Features](docs/user-stories.md) | What admins and members can do, prioritised for the MVP and later |
| [API Reference](docs/api.md) | Every endpoint, socket event and Redis channel |

## Course Requirements Checklist

- [x] Microservices architecture
- [x] At least 4 microservices — Auth & Org, Rules & Tasks, Scheduler, Notification & Realtime
- [x] At least 1 client — React PWA (admin + member views)
- [x] Real-time communication — Socket.IO push + Redis pub/sub between services

## Tech Stack

React · TypeScript · Vite · Node.js · Express · PostgreSQL · Prisma · Socket.IO · Redis · Docker Compose

## Project Structure

```
orgpulse/
├── client/                  React PWA (port 5173)
├── gateway/                 API Gateway: JWT checks and routing (port 8080)
├── services/
│   ├── auth-service/          Users, organisations, groups (port 4001)
│   ├── rules-service/         Rules, tasks, swaps (port 4002)
│   ├── scheduler-service/     Works out what is due (port 4003)
│   └── notification-service/  Notifications, wishes, Socket.IO (port 4004)
├── infra/postgres/          Creates one database schema per service
├── requests/                Ready-made API requests and a browser socket test
├── scripts/                 Project helper scripts
├── docs/                    Proposal, architecture, user stories, API reference
└── docker-compose.yml       Starts everything with one command
```

Each service has its own Prisma schema and Postgres schema, and never reads another service's tables.

## Run with Docker

This is the quickest way to run the whole system. It needs Docker Desktop, and ports 4001–4004, 5173, 5433, 6379 and 8080 must be free.

**1. Start everything.** Migrations run automatically.

```bash
docker compose up --build -d
```

**2. Add the demo data** once the containers are running. Without Node.js on your machine, run the two commands behind this script from `package.json`.

```bash
npm run seed:docker
```

**3. Open** http://localhost:5173

| Task | Command |
|---|---|
| See the logs | `docker compose logs -f` |
| Stop | `docker compose down` |
| Stop and delete all data | `docker compose down -v` |

The Scheduler's timer is off in Docker, so **Run scheduler now** is what fires events. To turn the timer on, start with `SCHEDULER_ENABLED=true docker compose up --build -d`.

## Run Locally

This is the setup for developing. It needs Node.js 22 or later, npm, and Docker Desktop for Postgres and Redis.

**One-time setup:**

```bash
npm install
npm run setup:env
npm run db:up
npm run db:migrate
```

**Start the backend** and leave it running:

```bash
npm run dev
```

**In a second terminal, add the demo data** and start the client:

```bash
npm run seed:demo
npm run dev:client
```

Then open http://localhost:5173. Use `npm run seed` instead of `seed:demo` to keep cleaning on Mondays.

Stop `npm run dev` before using `docker compose up`, because both use the same ports. They also share one database.

| Task | Command |
|---|---|
| Check that all services are up | Open http://localhost:8080/status |
| Run the unit tests | `npm run test -w rules-service` (also `scheduler-service` and `notification-service`) |
| Browse a service's database | `cd services/auth-service && npx prisma studio` |
| Try the API by hand | Open a file in `requests/` with the VS Code REST Client extension |

## Demo Accounts

Every account uses the password **`password123`**.

| Email | Role |
|---|---|
| `admin@grace.test` | Admin of Grace Church |
| `grace@grace.test` | Member. Her birthday is the day you seed, and she is first in the cleaning rotation |
| `john@grace.test` | Member |
| `mary@grace.test` | Member |
| `peter@grace.test` | Member |
| `ruth@grace.test` | Member |

The demo organisation's invite code is **`GRACE1`**.

## 3-Minute Demo

### Before the demo

Run this shortly before you present, because Grace's birthday and the cleaning duty are set to the day you seed:

```bash
docker compose down -v
docker compose up --build -d
npm run seed:docker
```

Open two browser windows at http://localhost:5173: a normal one and an incognito one. Log in as `admin@grace.test` in the normal window.

### Script

| # | Time | Window | Do this | Point out |
|---|---|---|---|---|
| 1 | 0:00 | Admin | Open **Admin** | Grace Church and its invite code. *Auth & Organisation service* |
| 2 | 0:20 | Admin | Open **Rules** | Birthdays, the weekly cleaning rotation and choir practice. Each one is a single rule, not hundreds of calendar entries. *Rules & Tasks service* |
| 3 | 0:45 | Admin | Open **Preview** | What will happen this week. Nothing has been sent |
| 4 | 1:05 | Incognito | Log in as `grace@grace.test` | "Nothing for you today" |
| 5 | 1:20 | Admin | Open **Overview**, press **Run scheduler now** | *Scheduler service* works out what is due and publishes events to Redis |
| 6 | 1:35 | Incognito | Just watch | The birthday announcement, the cleaning duty and the unread badge appear with no refresh. *Notification & Realtime service, over Socket.IO* |
| 7 | 2:00 | Both | Admin: open **Board**. Grace: press **Mark done** | The admin's board updates without a refresh |
| 8 | 2:30 | Both | Admin: open **Today**, type a wish, press **Send wish** | The wish appears instantly on both screens |

Pressing **Run scheduler now** a second time shows that nothing is sent twice. **Reset today** on the Admin overview lets you run the demo again.

## Troubleshooting

| Problem | Fix |
|---|---|
| A port is already in use | Stop whatever is using it. `lsof -i :5173` shows what that is |
| "Internal server error" when logging in | The database has no tables or data, usually after `docker compose down -v`. With `npm run dev` running, run `npm run db:migrate`, then `npm run seed:demo`. With Docker, run `npm run seed:docker` |
| Containers stay on `Created` | `npm run dev` or `npm run dev:client` still holds the ports. Stop them, then run `docker compose up --build -d` again |
| "Reconnecting" stays on screen | The Notification service is not reachable on port 4004. Check http://localhost:8080/status |
| Grace has no birthday card or duty | Seed again today, then use **Reset today** and **Run scheduler now** |
| The page looks out of date after a rebuild | The app's service worker may be serving an older version. Close the tab and open it again |
| `seed:docker` fails | Wait until `docker compose ps` shows the services as healthy, then try again |
