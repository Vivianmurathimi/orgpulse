# OrgPulse — Architecture

This document describes how OrgPulse is split into microservices, how they talk to each other, what data each one owns, and how the key flows work.

---

## 1. System Overview

```mermaid
flowchart TB
    subgraph Client
        PWA["React PWA<br/>Admin view · Member view"]
    end

    PWA -- "REST (HTTP)" --> GW[API Gateway :8080]
    PWA <-- "WebSocket (Socket.IO)" --> NS

    subgraph Services
        AUTH["Auth & Organisation<br/>:4001"]
        RULES["Rules & Tasks<br/>:4002"]
        SCHED["Scheduler<br/>:4003 (no UI)"]
        NS["Notification & Realtime<br/>:4004"]
    end

    GW --> AUTH
    GW --> RULES
    GW --> NS

    SCHED -- "GET active rules" --> RULES
    SCHED -- "GET members / availability" --> AUTH
    SCHED -- "publish due.*" --> REDIS[(Redis pub/sub)]
    RULES -- "publish task.*" --> REDIS
    REDIS -- "subscribe" --> NS

    AUTH --- DBA[(auth schema)]
    RULES --- DBR[(rules schema)]
    SCHED --- DBS[(scheduler schema)]
    NS --- DBN[(notifications schema)]
```

**Principles**

- **Database per service** — each service owns its own PostgreSQL schema; no service reads another service's tables.
- **Synchronous** calls (REST) for user actions that need an immediate answer.
- **Asynchronous** events (Redis pub/sub) for "something happened, whoever cares should react" — keeps services loosely coupled.
- **Stateless JWT** — the Gateway verifies the token once and forwards `userId`, `orgId` and `role` to services in headers.

---

## 2. Services

### 2.1 Auth & Organisation Service

| Owns | Exposes |
|---|---|
| Users, organisations, memberships, groups, roles, invite codes, unavailability periods | `POST /auth/register`, `POST /auth/login`, `GET /me` |
| | `POST /orgs`, `POST /orgs/join` (invite code), `GET /orgs/:id/members` |
| | `POST /orgs/:id/groups`, `PATCH /members/:id/role` |
| | `POST /me/unavailable` (e.g. on holiday 1–14 Dec) |

### 2.2 Rules & Tasks Service

| Owns | Exposes |
|---|---|
| Rules (birthday / rotation / task), rotation order, task instances and their status, swap requests | `POST /rules`, `GET /rules`, `PATCH /rules/:id` (edit, pause, resume) |
| | `GET /rules/preview?days=7` — what will fire in the next N days |
| | `GET /tasks/mine/upcoming`, `PATCH /tasks/:id/done` |
| | `POST /tasks/:id/swap`, `PATCH /swaps/:id` (accept / decline) |

Publishes: `task.completed`, `task.swapped`, `task.created`.

### 2.3 Scheduler Service

- Runs on a timer (every minute in dev; manual `POST /scheduler/run` for the demo).
- Asks Rules & Tasks for active rules and Auth & Org for members and their availability.
- Decides what is due and for whom — including **whose turn it is**, skipping anyone marked unavailable.
- Records what it has already fired (`fired_events`) so the same notification is never sent twice, even if it restarts.
- Publishes `due.birthday`, `due.task`, `due.reminder`.

### 2.4 Notification & Realtime Service

- Holds a Socket.IO connection per logged-in user; each user joins rooms `user:<id>` and `org:<id>`.
- Subscribes to Redis, stores each notification in history, then pushes it to the right room.
- Handles live interactions that originate on the socket: birthday wishes, read receipts.
- Respects each user's preferences (quiet hours, muted categories).

| Exposes | |
|---|---|
| REST | `GET /notifications?unread=true`, `PATCH /notifications/:id/read`, `PUT /preferences` |
| Socket events (server → client) | `notification:new`, `task:updated`, `wish:new` |
| Socket events (client → server) | `wish:send`, `notification:read` |

---

## 3. Event Contract (Redis channels)

| Channel | Publisher | Payload (simplified) | Who gets it |
|---|---|---|---|
| `due.birthday` | Scheduler | `{ orgId, memberId, memberName, date }` | Whole org (`org:<id>`) |
| `due.task` | Scheduler | `{ orgId, ruleId, taskId, assigneeIds[], title, dueAt }` | Assignees |
| `due.reminder` | Scheduler | `{ taskId, assigneeIds[], dueAt }` | Assignees (e.g. 24 h before a deadline) |
| `task.completed` | Rules & Tasks | `{ orgId, taskId, completedBy }` | Admins + task's group |
| `task.swapped` | Rules & Tasks | `{ taskId, fromId, toId }` | Both members + admins |

Every event carries an `eventId` so consumers can ignore duplicates (idempotency).

---

## 4. Key Flows

### 4.1 Rule fires → member is notified

```mermaid
sequenceDiagram
    autonumber
    participant S as Scheduler
    participant R as Rules & Tasks
    participant A as Auth & Org
    participant Q as Redis
    participant N as Notification & Realtime
    actor M as Member (browser)

    S->>R: GET /rules?active=true
    R-->>S: rules[]
    S->>A: GET /orgs/:id/members (+ availability)
    A-->>S: members[]
    S->>S: Evaluate: due now? whose turn? skip unavailable
    S->>S: Already in fired_events? → skip
    S->>R: POST /tasks (create task instance)
    S->>Q: PUBLISH due.task {eventId, assigneeIds...}
    S->>S: Save to fired_events
    Q-->>N: due.task
    N->>N: Save to history, check quiet hours
    N-->>M: socket emit notification:new
```

### 4.2 Member marks task "Done" → admin sees it live

```mermaid
sequenceDiagram
    actor M as Member
    participant G as API Gateway
    participant R as Rules & Tasks
    participant Q as Redis
    participant N as Notification & Realtime
    actor Ad as Admin

    M->>G: PATCH /tasks/42/done (JWT)
    G->>R: forward (userId, orgId)
    R->>R: status = done
    R-->>M: 200 OK
    R->>Q: PUBLISH task.completed
    Q-->>N: task.completed
    N-->>Ad: socket emit task:updated
```

### 4.3 Duty swap

```mermaid
sequenceDiagram
    actor Grace
    actor John
    participant R as Rules & Tasks
    participant N as Notification & Realtime

    Grace->>R: POST /tasks/42/swap {to: John}
    R-->>N: swap requested
    N-->>John: "Grace asked you to take cleaning this week"
    John->>R: PATCH /swaps/7 {accept}
    R->>R: Reassign task 42 to John
    R-->>N: task.swapped
    N-->>Grace: "John accepted your swap"
    N-->>John: "You're on cleaning duty this week"
```

### 4.4 Birthday with live wishes

```mermaid
sequenceDiagram
    participant S as Scheduler
    participant N as Notification & Realtime
    actor A as Member A
    actor B as Member B

    S-->>N: due.birthday {memberName: "Grace"}
    N-->>A: "Today is Grace's birthday 🎉"
    N-->>B: "Today is Grace's birthday 🎉"
    A->>N: wish:send "Happy birthday Grace!"
    N-->>B: wish:new (appears instantly)
    N-->>A: wish:new
```

---

## 5. Task Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending: Scheduler creates task
    Pending --> SwapRequested: Assignee requests swap
    SwapRequested --> Pending: Declined
    SwapRequested --> Pending: Accepted (new assignee)
    Pending --> Done: Marked done
    Pending --> Overdue: Due time passed
    Overdue --> Done: Marked done late
    Pending --> Skipped: Admin skips (e.g. holiday)
    Done --> [*]
    Skipped --> [*]
```

---

## 6. Data Model (one schema per service)

### 6.1 Auth & Organisation

```mermaid
erDiagram
    USER ||--o{ MEMBERSHIP : has
    ORGANISATION ||--o{ MEMBERSHIP : has
    ORGANISATION ||--o{ GROUP : contains
    GROUP ||--o{ GROUP_MEMBER : has
    MEMBERSHIP ||--o{ GROUP_MEMBER : in
    MEMBERSHIP ||--o{ UNAVAILABILITY : declares

    USER {
        uuid id PK
        string email
        string passwordHash
        string name
        date birthday
        boolean showBirthday
    }
    ORGANISATION {
        uuid id PK
        string name
        string inviteCode
        string timezone
    }
    MEMBERSHIP {
        uuid id PK
        uuid userId FK
        uuid orgId FK
        enum role "admin | member"
    }
    GROUP {
        uuid id PK
        uuid orgId FK
        string name
    }
    GROUP_MEMBER {
        uuid groupId FK
        uuid membershipId FK
    }
    UNAVAILABILITY {
        uuid id PK
        uuid membershipId FK
        date from
        date to
    }
```

### 6.2 Rules & Tasks

```mermaid
erDiagram
    RULE ||--o{ ROTATION_SLOT : orders
    RULE ||--o{ TASK : generates
    TASK ||--o{ SWAP_REQUEST : has

    RULE {
        uuid id PK
        uuid orgId
        enum type "birthday | rotation | task"
        string title
        string schedule "e.g. weekly MON 08:00"
        uuid targetGroupId
        int reminderHoursBefore
        boolean paused
    }
    ROTATION_SLOT {
        uuid ruleId FK
        uuid memberId
        int position
    }
    TASK {
        uuid id PK
        uuid ruleId FK
        uuid assigneeId
        datetime dueAt
        enum status "pending | done | overdue | skipped"
        datetime completedAt
    }
    SWAP_REQUEST {
        uuid id PK
        uuid taskId FK
        uuid fromId
        uuid toId
        enum status "open | accepted | declined"
    }
```

> `memberId`, `assigneeId` and `orgId` are plain IDs — not foreign keys — because users live in another service's database.

### 6.3 Scheduler

```mermaid
erDiagram
    FIRED_EVENT {
        string eventKey PK "ruleId + date + type"
        datetime firedAt
    }
    ROTATION_CURSOR {
        uuid ruleId PK
        int currentPosition
        date lastAdvancedOn
    }
```

### 6.4 Notification & Realtime

```mermaid
erDiagram
    NOTIFICATION ||--o{ WISH : receives
    NOTIFICATION {
        uuid id PK
        uuid userId
        uuid orgId
        string category "birthday | task | reminder | swap"
        string message
        boolean read
        datetime createdAt
    }
    WISH {
        uuid id PK
        uuid notificationId FK
        uuid fromUserId
        string text
        datetime createdAt
    }
    PREFERENCE {
        uuid userId PK
        time quietFrom
        time quietTo
        string[] mutedCategories
    }
```

---

## 7. Deployment (Docker Compose)

```mermaid
flowchart LR
    subgraph docker-compose
        web[client :5173]
        gw[gateway :8080]
        auth[auth-service :4001]
        rules[rules-service :4002]
        sched[scheduler-service :4003]
        notif[notification-service :4004]
        pg[(postgres :5432<br/>4 schemas)]
        redis[(redis :6379)]
    end

    web --> gw
    web <--> notif
    gw --> auth & rules & notif
    sched --> rules & auth
    sched --> redis
    rules --> redis
    redis --> notif
    auth & rules & sched & notif --> pg
```

One command starts everything:

```bash
docker compose up --build
```

---

## 8. Design Decisions

| Decision | Why |
|---|---|
| Store rules, generate tasks on the fly | Keeps data small and the calendar clean; editing a rule changes all future occurrences |
| Scheduler is its own service | Time-based logic is isolated; can be scaled or restarted without touching user-facing services |
| Redis pub/sub between Scheduler and Notification | Scheduler doesn't need to know who is online or how messages are delivered |
| `fired_events` table | Prevents duplicate notifications after a restart (idempotency) |
| Socket.IO rooms per user and per org | One emit reaches exactly the right people |
| Organisation timezone | "Today" means today for the church, not for the server |
