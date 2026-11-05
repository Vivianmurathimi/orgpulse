import { Cake, Check } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import { Empty, ErrorBox, Loading } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { useMember } from "../context/AuthContext";
import { useRealtime, useSocketEvent } from "../context/RealtimeContext";
import { useLoad } from "../hooks/useLoad";
import { formatDay, formatTime, todayIn } from "../lib/dates";
import type { Notification, Task, Wish } from "../types";

interface Feed {
  tasks: Task[];
  notifications: Notification[];
  wishes: Wish[];
}

interface Birthday {
  memberId: string;
  memberName: string;
}

// Today's birthdays come from the announcements, so one appears the moment it's announced
function birthdaysToday(notifications: Notification[], today: string): Birthday[] {
  const byMember = new Map<string, Birthday>();

  for (const { category, data } of notifications) {
    if (category === "BIRTHDAY" && data?.date === today && data.memberId) {
      byMember.set(data.memberId, { memberId: data.memberId, memberName: data.memberName });
    }
  }
  return [...byMember.values()];
}

export function TodayPage() {
  const { org, user } = useMember();
  const today = todayIn(org.timezone);

  const feed = useLoad<Feed>(async () => {
    const [tasks, notifications, wishes] = await Promise.all([
      api<Task[]>("/api/tasks/today"),
      api<Notification[]>("/api/notifications"),
      api<Wish[]>(`/api/wishes?date=${today}`),
    ]);
    return { tasks, notifications, wishes };
  }, [org.id]);

  // Anything new or changed reloads the feed straight away
  useSocketEvent("notification:new", () => void feed.reload());
  useSocketEvent("task:updated", () => void feed.reload());
  useSocketEvent("connect", () => void feed.reload()); // catch up after a lost connection

  useSocketEvent<Wish>("wish:new", (wish) => {
    feed.setData((current) => {
      if (!current || current.wishes.some(({ id }) => id === wish.id)) return current;
      return { ...current, wishes: [...current.wishes, wish] };
    });
  });

  const birthdays = useMemo(
    () => birthdaysToday(feed.data?.notifications ?? [], today),
    [feed.data, today],
  );

  return (
    <>
      <div className="page-heading">
        <h1>Today</h1>
        <p className="muted">{formatDay(today)}</p>
      </div>

      {feed.loading && !feed.data && <Loading />}
      {feed.error && <ErrorBox message={feed.error} onRetry={feed.reload} />}

      {feed.data && (
        <div className="stack">
          {birthdays.map((birthday) => (
            <BirthdayCard
              key={birthday.memberId}
              birthday={birthday}
              isMine={birthday.memberId === user.id}
              wishes={feed.data!.wishes.filter(
                (wish) => wish.birthdayUserId === birthday.memberId,
              )}
            />
          ))}

          {feed.data.tasks.map((task) => (
            <DutyCard
              key={task.id}
              task={task}
              timezone={org.timezone}
              onChanged={feed.reload}
            />
          ))}

          {birthdays.length === 0 && feed.data.tasks.length === 0 && (
            <Empty title="Nothing for you today 🎉">
              We'll let you know when something comes up.
            </Empty>
          )}
        </div>
      )}
    </>
  );
}

function BirthdayCard(props: { birthday: Birthday; isMine: boolean; wishes: Wish[] }) {
  const { birthday, isMine, wishes } = props;
  const { socket } = useRealtime();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function send(event: FormEvent) {
    event.preventDefault();
    if (!socket) return;
    setBusy(true);
    setError(null);

    // The wish appears through the wish:new event, the same way as for everyone else
    socket
      .timeout(5000)
      .emit(
        "wish:send",
        { birthdayUserId: birthday.memberId, text },
        (timedOut: Error | null, response?: { error?: string }) => {
          setBusy(false);
          if (timedOut) setError("No answer from the server. Please try again.");
          else if (response?.error) setError(response.error);
          else setText("");
        },
      );
  }

  return (
    <article className="card birthday">
      <div className="card-title">
        <Cake aria-hidden size={22} />
        <h2>{isMine ? "Happy birthday! 🎉" : `${birthday.memberName}'s birthday`}</h2>
      </div>

      {wishes.length > 0 && (
        <ul className="wishes">
          {wishes.map((wish) => (
            <li key={wish.id}>
              <strong>{wish.fromName}</strong> {wish.text}
            </li>
          ))}
        </ul>
      )}

      {!isMine && (
        <form className="inline-form" onSubmit={send}>
          <input
            aria-label={`Wish for ${birthday.memberName}`}
            placeholder="Send a wish..."
            required
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button className="button primary" disabled={busy}>
            Send wish
          </button>
        </form>
      )}
      {error && <ErrorBox message={error} />}
    </article>
  );
}

function DutyCard(props: { task: Task; timezone: string; onChanged: () => Promise<void> }) {
  const { task, timezone, onChanged } = props;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function markDone() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tasks/${task.id}/done`, { method: "PATCH" });
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`card duty ${task.status === "DONE" ? "duty-done" : ""}`}>
      <div className="row">
        <div>
          <h2>{task.title}</h2>
          <p className="muted">Due {formatTime(task.dueAt, timezone)}</p>
        </div>
        <StatusBadge status={task.status} />
      </div>

      {task.status !== "DONE" && (
        <button type="button" className="button primary full" disabled={busy} onClick={markDone}>
          <Check aria-hidden size={18} />
          {busy ? "Saving..." : "Mark done"}
        </button>
      )}
      {error && <ErrorBox message={error} />}
    </article>
  );
}
