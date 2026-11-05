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
    GW -- "admin: run now" --> SCHED

    SCHED -- "GET active rules, create tasks" --> RULES
    SCHED -- "GET members / availability" --> AUTH
    SCHED -- "publish due.*" --> REDIS[(Redis pub/sub)]
    RULES -- "publish task.*" --> REDIS
    RULES -- "GET members" --> AUTH
    NS -- "GET members" --> AUTH
    REDIS -- "subscribe" --> NS

    AUTH --- DBA[(auth schema)]
    RULES --- DBR[(rules schema)]
    SCHED --- DBS[(scheduler schema)]
    NS --- DBN[(notification schema)]
```

**Principles**

- **Database per service** — each service owns its own PostgreSQL schema; no service reads another service's tables.
- **Synchronous** calls (REST) for user actions that need an immediate answer.
- **Asynchronous** events (Redis pub/sub) for "something happened, whoever cares should react" — keeps services loosely coupled.
- **Stateless JWT** — the Gateway verifies the token once and forwards `userId`, `orgId` and `role` to services in headers. It removes those headers if a client sends them.
- **Internal routes** — services call each other directly on `/internal/*` with a shared `x-internal-key`. The gateway does not expose these routes.
- **One Socket.IO exception** — all REST traffic goes through the gateway. Only the live socket connects straight to the Notification service, which checks the token itself.

---

## 2. Services

### 2.1 Auth & Organisation Service

**Owns:** users, organisations, memberships, groups, roles, invite codes and unavailability periods.

- Registration, login and JWTs (valid for 7 days).
- Creating and joining organisations, members, roles and groups.
- Marking dates as unavailable.
- Internal routes that give other services members, timezones and availability.
- Checks memberships in its own database on each request, so a removed member is refused straight away.

### 2.2 Rules & Tasks Service

**Owns:** rules (birthday / rotation / task), rotation order, task instances and their status, and swap requests.

- Creating, editing, pausing, resuming and deleting rules, and skipping one occurrence.
- Previewing the next N days, without creating or sending anything.
- A member's tasks for today and the next 4 weeks, and marking tasks done.
- A status board for admins, and duty swaps.

Publishes: `task.completed`, `task.swap_requested`, `task.swapped`.

### 2.3 Scheduler Service

- Runs on a timer (`SCHEDULER_CRON`, every minute by default) when `SCHEDULER_ENABLED` is on. An admin can also run it for their own organisation with `POST /api/scheduler/run`.
- Asks Rules & Tasks for active rules and Auth & Org for members and their availability.
- Decides what is due and for whom — including **whose turn it is**, skipping anyone marked unavailable.
- Creates a task on its day, or earlier if its reminder is due first, so a reminder can arrive before the duty does.
- Records what it has already fired (`FiredEvent`) so the same notification is never sent twice, even if it restarts. If publishing fails, the record is removed and the next run tries again.
- Runs one job at a time, so the timer and the button cannot overlap.
- Publishes `due.birthday`, `due.task`, `due.reminder`.

### 2.4 Notification & Realtime Service

- Holds a Socket.IO connection per logged-in user; each user joins rooms `user:<id>` and `org:<id>`.
- Subscribes to Redis, stores each notification in history, then pushes it to the right room.
- Handles live interactions that originate on the socket: birthday wishes, read receipts.
- Respects each user's preferences (quiet hours, muted categories). Those notifications are saved but not pushed.

Every endpoint and socket event is listed in the [API Reference](api.md).

---

## 3. Event Contract (Redis channels)

| Channel | Publisher | Payload (simplified) | Who gets it |
|---|---|---|---|
| `due.birthday` | Scheduler | `{ orgId, memberId, memberName, date }` | Whole org |
| `due.task` | Scheduler | `{ orgId, ruleId, taskId, assigneeIds[], title, dueAt }` | Assignees, or admins if nobody is available |
| `due.reminder` | Scheduler | `{ orgId, taskId, assigneeIds[], title, dueAt }` | Assignees (e.g. 24 h before a deadline) |
| `task.completed` | Rules & Tasks | `{ orgId, taskId, title, completedBy, completedByName }` | Admins |
| `task.swap_requested` | Rules & Tasks | `{ orgId, swapId, taskId, title, fromId, fromName, toId }` | The person being asked |
| `task.swapped` | Rules & Tasks | `{ orgId, taskId, title, fromId, toId }` | Both members + admins |

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

    S->>R: GET /internal/rules?active=true
    R-->>S: rules[]
    S->>A: GET /internal/orgs/:id/members (+ availability)
    A-->>S: members[]
    S->>S: Evaluate: due today? whose turn? skip unavailable
    S->>R: POST /internal/tasks (safe to repeat)
    R-->>S: task
    S->>S: Save to FiredEvent (already there? stop)
    S->>Q: PUBLISH due.task {eventId, assigneeIds...}
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

    Grace->>R: POST /tasks/42/swap {toMemberId: John}
    R-->>N: task.swap_requested
    N-->>John: "Grace asked you to take cleaning this week"
    John->>R: PATCH /swaps/7 {action: accept}
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
    [*] --> Skipped: Admin skips the occurrence
    Pending --> Pending: Swap accepted (new assignee)
    Pending --> Done: Marked done
    Pending --> Overdue: Due time passed
    Overdue --> Done: Marked done late
    Pending --> Skipped: Admin skips (e.g. holiday)
    Done --> [*]
    Skipped --> [*]
```

A swap request is stored separately, so the task stays pending while it waits for an answer.

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
        enum frequency "once | daily | weekly | monthly"
        int dayOfWeek
        int dayOfMonth
        string timeOfDay "HH:mm"
        date startDate
        uuid targetGroupId
        string[] assigneeIds
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
        uuid orgId
        string title
        string[] assigneeIds
        datetime dueAt
        enum status "pending | done | overdue | skipped"
        datetime completedAt
        string occurrenceKey "ruleId:YYYY-MM-DD, unique"
    }
    SWAP_REQUEST {
        uuid id PK
        uuid taskId FK
        uuid fromId
        uuid toId
        enum status "open | accepted | declined"
    }
```

> A task has a list of assignees: one person for a rotation, several for a shared task, and nobody if the whole rotation was unavailable. Any assignee can complete a shared task, and that completes it for everyone.
>
> `memberId`, `assigneeIds` and `orgId` are plain IDs — not foreign keys — because users live in another service's database.

### 6.3 Scheduler

```mermaid
erDiagram
    FIRED_EVENT {
        string eventKey PK "type:ruleId-or-memberId:date"
        uuid orgId
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
    NOTIFICATION {
        uuid id PK
        uuid userId
        uuid orgId
        enum category "birthday | task | reminder | swap | status"
        string title
        string message
        json data
        boolean read
        uuid eventId "unique per user"
        datetime createdAt
    }
    WISH {
        uuid id PK
        uuid orgId
        uuid birthdayUserId
        date birthdayDate
        uuid fromUserId
        string fromName
        string text
        datetime createdAt
    }
    PREFERENCE {
        uuid userId PK
        string quietFrom "HH:mm"
        string quietTo "HH:mm"
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
        pg[(postgres :5432, 5433 on the host<br/>4 schemas)]
        redis[(redis :6379)]
    end

    web --> gw
    web <--> notif
    gw --> auth & rules & sched & notif
    sched --> rules & auth
    rules --> auth
    notif --> auth
    sched --> redis
    rules --> redis
    redis --> notif
    auth & rules & sched & notif --> pg
```

One command starts everything:

```bash
docker compose up --build
```

Each service applies its database migrations when it starts. The Scheduler's timer is off by default in Docker, so the "Run scheduler now" button is what fires events in the demo. `SCHEDULER_ENABLED=true docker compose up` turns it on.

---

## 8. Design Decisions

| Decision | Why |
|---|---|
| Store rules, generate tasks on the fly | Keeps data small and the calendar clean; editing a rule changes all future occurrences |
| Scheduler is its own service | Time-based logic is isolated; can be scaled or restarted without touching user-facing services |
| Redis pub/sub between Scheduler and Notification | Scheduler doesn't need to know who is online or how messages are delivered |
| `FiredEvent` table | Prevents duplicate notifications after a restart (idempotency) |
| Socket.IO rooms per user and per org | One emit reaches exactly the right people |
| Organisation timezone | "Today" means today for the church, not for the server |
| A task has a list of assignees | One due event can reach a whole choir, while a rotation simply has a list of one |
| Tasks can be created before their day | A reminder needs a task to point at, so the task is created when the reminder is due, and the duty is announced on its day |
| A rotation moves on by one per occurrence | A stand-in covers one turn, and everyone keeps their place in the order |
| The "Run scheduler now" button runs one organisation | One admin must not be able to trigger notifications for another organisation |

## 9. Known Limitations

| Limitation | Why it is acceptable for this project |
|---|---|
| Redis pub/sub does not store messages | An event published while the Notification service is down is lost. A message queue would fix this |
| Only Auth & Org checks membership on each request | Other services trust the token's role, so a removed or demoted user keeps that access there until the token is refreshed or expires |
| Duties are announced at the start of their day | `timeOfDay` is the deadline. Quiet hours can hold back the push |
| Tasks turning overdue have no event | The status board shows this after a refresh |
| Reordering a rotation keeps its position | The next turn goes to whoever is now at that position |
