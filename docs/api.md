# OrgPulse — API Reference

Every endpoint, grouped by the service that owns it.

**How to call the API**

- The client uses REST only through the gateway at `http://localhost:8080`.
- Send the token from register or login as `Authorization: Bearer <token>`.
- Request bodies are JSON. Errors always look like `{ "error": "message" }`.
- Dates are `YYYY-MM-DD`. Clock times are `HH:mm`, in the organisation's timezone.
- A "member ID" is always a user ID.

**Access levels used below**

| Level | Meaning |
|---|---|
| Public | No token needed |
| User | Any valid token |
| Member | A token for an organisation |
| Admin | A token for an organisation, with the `ADMIN` role |
| Internal | Service-to-service only: needs the `x-internal-key` header, and the gateway does not expose it |

---

## API Gateway (port 8080)

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/health` | Public | The gateway's own health |
| GET | `/status` | Public | Checks all 4 services: `{ status, services }` |

The gateway verifies the JWT on every other request, removes any `x-user-id`, `x-org-id`, `x-user-role` or `x-internal-key` header sent by the client, and forwards the real identity to the service.

| Path prefix | Forwarded to |
|---|---|
| `/api/auth`, `/api/orgs` | Auth & Organisation |
| `/api/rules`, `/api/tasks`, `/api/swaps` | Rules & Tasks |
| `/api/notifications`, `/api/preferences`, `/api/wishes` | Notification & Realtime |
| `/api/scheduler` | Scheduler (admins only) |

If a service is down, the gateway answers `503`.

---

## Auth & Organisation service (port 4001)

### Accounts

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| POST | `/api/auth/register` | Public | `{ email, password, name, birthday? }` | `201 { token, user }` |
| POST | `/api/auth/login` | Public | `{ email, password }` | `{ token, user, memberships[] }` |
| POST | `/api/auth/switch-org` | User | `{ orgId }` | `{ token }` for that organisation |
| GET | `/api/auth/me` | User | | `{ user, memberships[] }` |
| PATCH | `/api/auth/me` | User | `{ name?, birthday?, showBirthday? }` | `{ user }` |

Passwords need 8 to 72 characters. Sending `birthday: null` removes a birthday.

### Unavailable dates

These apply to the current organisation.

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| GET | `/api/auth/me/unavailable` | Member | | `[{ id, from, to }]` |
| POST | `/api/auth/me/unavailable` | Member | `{ from, to }` | `201 { id, from, to }` |
| DELETE | `/api/auth/me/unavailable/:id` | Member | | `204` |

### Organisations

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| POST | `/api/orgs` | User | `{ name, timezone? }` | `201 { token, organisation }`. The creator becomes an admin |
| POST | `/api/orgs/join` | User | `{ inviteCode }` | `201 { token, organisation }` |
| GET | `/api/orgs/current` | Member | | Organisation details. Admins also get `inviteCode` |

### Members and groups

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| GET | `/api/orgs/current/members` | Member | | `[{ membershipId, userId, name, role, birthday, groups[] }]` |
| PATCH | `/api/orgs/current/members/:membershipId` | Admin | `{ role }` | `{ membershipId, userId, role }` |
| DELETE | `/api/orgs/current/members/:membershipId` | Admin | | `204` |
| GET | `/api/orgs/current/groups` | Member | | `[{ id, name, membershipIds[] }]` |
| POST | `/api/orgs/current/groups` | Admin | `{ name }` | `201 { id, name, membershipIds }` |
| POST | `/api/orgs/current/groups/:id/members` | Admin | `{ membershipIds[] }` | `{ id, name, membershipIds }` |

A hidden birthday (`showBirthday: false`) is visible only to its owner. An organisation must always keep at least one admin, so demoting or removing the last one returns `400`.

### Internal

| Method | Path | Access | Returns |
|---|---|---|---|
| GET | `/internal/orgs` | Internal | `[{ id, name, timezone }]` |
| GET | `/internal/orgs/:orgId/members` | Internal | Members with `role`, `birthday`, `showBirthday`, `groupIds[]` and `unavailability[]` |
| GET | `/internal/users/:id` | Internal | `{ id, name }` |

---

## Rules & Tasks service (port 4002)

### Rules (admins only)

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| GET | `/api/rules` | Admin | | All rules, each with its `rotation[]` |
| POST | `/api/rules` | Admin | See below | `201` the rule |
| GET | `/api/rules/preview?days=7` | Admin | | `[{ date, ruleId, ruleTitle, type, who[] }]`. `days` is 1 to 60. Nothing is created or sent |
| GET | `/api/rules/:id` | Admin | | The rule |
| PATCH | `/api/rules/:id` | Admin | Any rule field except `type`, plus `paused` | The rule. Existing tasks do not change |
| DELETE | `/api/rules/:id` | Admin | | `204`. Also deletes the rule's tasks |
| PUT | `/api/rules/:id/rotation` | Admin | `{ memberIds[] }` | The rule. `memberIds` is the new order |
| POST | `/api/rules/:id/skip` | Admin | `{ date }` | The task, saved as `SKIPPED` |

**Rule body**

```json
{
  "type": "BIRTHDAY | ROTATION | TASK",
  "title": "Church cleaning",
  "description": "optional",
  "frequency": "ONCE | DAILY | WEEKLY | MONTHLY",
  "dayOfWeek": 1,
  "dayOfMonth": 15,
  "timeOfDay": "08:00",
  "startDate": "2026-11-09",
  "targetGroupId": "optional",
  "assigneeIds": [],
  "reminderHoursBefore": 24
}
```

`dayOfWeek` runs from 0 (Sunday) to 6, and is required for `WEEKLY`. `dayOfMonth` is required for `MONTHLY`. A `TASK` rule needs `assigneeIds` or a `targetGroupId`. A `BIRTHDAY` rule always runs daily.

### Tasks

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| GET | `/api/tasks/today` | Member | | My tasks due today |
| GET | `/api/tasks/mine/upcoming` | Member | | My next 4 weeks: `[{ taskId, ruleId, title, dueAt, status, predicted }]` |
| GET | `/api/tasks/board?from&to` | Admin | | `{ from, to, PENDING[], OVERDUE[], DONE[], SKIPPED[] }`. Defaults to 7 days from today |
| PATCH | `/api/tasks/:id/done` | Assignee or admin | | The task. Publishes `task.completed` |
| POST | `/api/tasks/:id/swap` | Assignee | `{ toMemberId }` | `201` the swap. Publishes `task.swap_requested` |

### Swaps

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| GET | `/api/swaps/open` | Member | | Swap requests waiting for my answer |
| PATCH | `/api/swaps/:id` | The person asked | `{ action: "accept" or "decline" }` | The swap. Accepting reassigns the task and publishes `task.swapped` |

### Internal

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| GET | `/internal/rules?active=true` | Internal | | Rules with `rotation[]`, in every organisation |
| GET | `/internal/tasks/pending` | Internal | | Pending tasks with `reminderHoursBefore` |
| POST | `/internal/tasks` | Internal | `{ ruleId, orgId, title, assigneeIds, dueAt, occurrenceKey }` | `{ task, created }`. Safe to repeat: the same `occurrenceKey` returns the existing task |
| POST | `/internal/tasks/mark-overdue` | Internal | `{ now? }` | `{ count }` |
| POST | `/internal/tasks/reset` | Internal | `{ orgId, from, to }` | `{ count }`. Makes finished tasks pending again, for repeating the demo |

---

## Scheduler service (port 4003)

| Method | Path | Access | Returns |
|---|---|---|---|
| POST | `/api/scheduler/run` | Admin | `{ birthdays, tasks, reminders, skipped }`. Runs the admin's organisation now. This is the demo button |
| POST | `/api/scheduler/reset-today` | Admin | `{ eventsCleared, tasksReset }`. Forgets today's events so the demo can be repeated. Refused when `NODE_ENV=production` |

The scheduler also runs on a timer when `SCHEDULER_ENABLED` is not `false`. `SCHEDULER_CRON` sets how often.

---

## Notification & Realtime service (port 4004)

### REST

| Method | Path | Access | Body | Returns |
|---|---|---|---|---|
| GET | `/api/notifications?unread=true` | Member | | My latest 100 notifications, newest first |
| GET | `/api/notifications/unread-count` | Member | | `{ count }` |
| PATCH | `/api/notifications/:id/read` | Member | | `{ id, read }` |
| POST | `/api/notifications/read-all` | Member | | `{ count }` |
| GET | `/api/wishes?birthdayUserId&date` | Member | | Wishes for a date. Defaults to today |
| GET | `/api/preferences` | User | | `{ userId, quietFrom, quietTo, mutedCategories[] }` |
| PUT | `/api/preferences` | User | `{ quietFrom, quietTo, mutedCategories[] }` | The saved preferences |

Quiet hours need both times, or `null` for both. Categories are `BIRTHDAY`, `TASK`, `REMINDER`, `SWAP` and `STATUS`.

### Socket.IO

The client connects straight to `http://localhost:4004` with `auth: { token }`. A missing or invalid token is refused. Each connection joins the rooms `user:<userId>` and `org:<orgId>`.

| Direction | Event | Payload | Who receives it |
|---|---|---|---|
| Server to client | `notification:new` | The saved notification | The recipient, unless the category is muted or it is quiet hours |
| Server to client | `task:updated` | `{ taskId, reason }` | Everyone in the organisation. `reason` is `created`, `completed`, `swap_requested` or `swapped` |
| Server to client | `wish:new` | The saved wish | Everyone in the organisation |
| Client to server | `wish:send` | `{ birthdayUserId, text }` | Replies `{ ok, wish }` or `{ error }`. Only for someone whose birthday is today |
| Client to server | `notification:read` | `{ id }` | Replies `{ ok }` or `{ error }` |

---

## Redis channels

Every event also carries a unique `eventId`, so consumers can ignore duplicates.

| Channel | Publisher | Payload | Who is notified |
|---|---|---|---|
| `due.birthday` | Scheduler | `{ orgId, memberId, memberName, date }` | The whole organisation |
| `due.task` | Scheduler | `{ orgId, ruleId, taskId, assigneeIds[], title, dueAt }` | The assignees, or the admins if `assigneeIds` is empty |
| `due.reminder` | Scheduler | `{ orgId, taskId, assigneeIds[], title, dueAt }` | The assignees |
| `task.completed` | Rules & Tasks | `{ orgId, taskId, title, completedBy, completedByName }` | Admins, except whoever completed it |
| `task.swap_requested` | Rules & Tasks | `{ orgId, swapId, taskId, title, fromId, fromName, toId }` | The person being asked |
| `task.swapped` | Rules & Tasks | `{ orgId, taskId, title, fromId, toId }` | Both people and the admins |
