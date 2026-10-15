# OrgPulse

**Smart notifications for organisations — rules instead of calendar entries.**

OrgPulse lets churches, clubs, schools and teams define recurring duties once (birthdays, cleaning rotas, ushering rosters, assignments). The system works out what is due today and for whom, and notifies only the right people in real time — so nobody's calendar fills up with hundreds of entries.

## Documentation

| Document | What it covers |
|---|---|
| [Project Proposal](docs/proposal.md) | Problem, idea, use cases, scope, demo plan |
| [Architecture](docs/architecture.md) | The 4 microservices, communication, data model, key flows (Mermaid diagrams) |
| [User Stories & Features](docs/user-stories.md) | What admins and members can do, prioritised for the MVP and later |

## Course Requirements Checklist

- [x] Microservices architecture
- [x] At least 4 microservices — Auth & Org, Rules & Tasks, Scheduler, Notification & Realtime
- [x] At least 1 client — React PWA (admin + member views)
- [x] Real-time communication — Socket.IO push + Redis pub/sub between services

## Tech Stack

React · TypeScript · Vite · Node.js · Express · PostgreSQL · Prisma · Socket.IO · Redis · Docker Compose

## Quick Start

```bash
docker compose up --build
```

The client will be available at `http://localhost:5173` and the API Gateway at `http://localhost:8080`.
