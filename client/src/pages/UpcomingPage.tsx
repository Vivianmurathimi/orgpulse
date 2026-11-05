import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";
import { Empty, ErrorBox, Loading } from "../components/States";
import { StatusBadge } from "../components/StatusBadge";
import { useMember } from "../context/AuthContext";
import { useRealtime, useSocketEvent } from "../context/RealtimeContext";
import { useLoad } from "../hooks/useLoad";
import { formatMoment } from "../lib/dates";
import type { Member, UpcomingItem } from "../types";

export function UpcomingPage() {
  const { org, user } = useMember();

  const upcoming = useLoad(async () => {
    const [items, members] = await Promise.all([
      api<UpcomingItem[]>("/api/tasks/mine/upcoming"),
      api<Member[]>("/api/orgs/current/members"),
    ]);
    return { items, others: members.filter((member) => member.userId !== user.id) };
  }, [org.id]);

  useSocketEvent("task:updated", () => void upcoming.reload());

  return (
    <>
      <div className="page-heading">
        <h1>Upcoming</h1>
        <p className="muted">Your next 4 weeks</p>
      </div>

      {upcoming.loading && !upcoming.data && <Loading />}
      {upcoming.error && <ErrorBox message={upcoming.error} onRetry={upcoming.reload} />}

      {upcoming.data && upcoming.data.items.length === 0 && (
        <Empty title="Nothing coming up">Enjoy the quiet.</Empty>
      )}

      {upcoming.data && (
        <div className="stack">
          {upcoming.data.items.map((item) => (
            <article className="card" key={item.taskId ?? `${item.ruleId}:${item.dueAt}`}>
              <div className="row">
                <div>
                  <h2>{item.title}</h2>
                  <p className="muted">{formatMoment(item.dueAt, org.timezone)}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              {item.taskId && item.status === "PENDING" && (
                <SwapRequest taskId={item.taskId} others={upcoming.data!.others} />
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function SwapRequest({ taskId, others }: { taskId: string; others: Member[] }) {
  const { showToast } = useRealtime();
  const [open, setOpen] = useState(false);
  const [toMemberId, setToMemberId] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api(`/api/tasks/${taskId}/swap`, { method: "POST", body: { toMemberId } });
      setSent(true);
      showToast("Swap request sent");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (sent) return <p className="muted">Swap requested. Waiting for an answer.</p>;

  if (!open) {
    return (
      <button type="button" className="button small" onClick={() => setOpen(true)}>
        Request swap
      </button>
    );
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <select
        aria-label="Swap with"
        required
        value={toMemberId}
        onChange={(event) => setToMemberId(event.target.value)}
      >
        <option value="">Swap with...</option>
        {others.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.name}
          </option>
        ))}
      </select>
      <button className="button primary">Send</button>
      {error && <ErrorBox message={error} />}
    </form>
  );
}
