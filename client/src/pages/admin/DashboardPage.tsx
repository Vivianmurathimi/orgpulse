import { Check, Copy, Play, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../api";
import { AdminNav } from "../../components/AdminNav";
import { ErrorBox, Loading } from "../../components/States";
import { useMember } from "../../context/AuthContext";
import { useRealtime, useSocketEvent } from "../../context/RealtimeContext";
import { useLoad } from "../../hooks/useLoad";
import type { Board, Member, Org, Rule, RunSummary } from "../../types";

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function describeRun({ birthdays, tasks, reminders, skipped }: RunSummary): string {
  if (birthdays + tasks + reminders === 0) {
    return skipped > 0 ? "Nothing new: everything due has already been sent." : "Nothing is due right now.";
  }
  const sent = [
    birthdays && plural(birthdays, "birthday"),
    tasks && plural(tasks, "duty").replace("dutys", "duties"),
    reminders && plural(reminders, "reminder"),
  ].filter(Boolean);
  return `Sent: ${sent.join(", ")}.`;
}

export function DashboardPage() {
  const { org } = useMember();
  const { showToast } = useRealtime();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const overview = useLoad(async () => {
    const [details, members, rules, board] = await Promise.all([
      api<Org>("/api/orgs/current"),
      api<Member[]>("/api/orgs/current/members"),
      api<Rule[]>("/api/rules"),
      api<Board>("/api/tasks/board"),
    ]);
    return { details, members, rules, board };
  }, [org.id]);

  useSocketEvent("task:updated", () => void overview.reload());

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Couldn't copy. Please select the code instead.");
    }
  }

  async function run(path: string, describe: (data: never) => string) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(describe(await api<never>(path, { method: "POST" })));
      await overview.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const data = overview.data;

  return (
    <>
      <div className="page-heading">
        <h1>Admin</h1>
        <p className="muted">{org.name}</p>
      </div>
      <AdminNav />

      {overview.loading && !data && <Loading />}
      {overview.error && <ErrorBox message={overview.error} onRetry={overview.reload} />}

      {data && (
        <div className="stack">
          <section className="card run">
            <div>
              <h2>Run scheduler now</h2>
              <p className="muted">Sends everything that's due today.</p>
            </div>
            <button
              type="button"
              className="button primary full"
              disabled={busy}
              onClick={() => run("/api/scheduler/run", describeRun)}
            >
              <Play aria-hidden size={18} />
              {busy ? "Running..." : "Run scheduler now"}
            </button>
            {result && (
              <p className="result" role="status">
                {result}
              </p>
            )}
            {error && <ErrorBox message={error} />}
          </section>

          <section className="stats">
            <Link className="card stat" to="/admin/members">
              <strong>{data.members.length}</strong>
              <span>Members</span>
            </Link>
            <Link className="card stat" to="/admin/rules">
              <strong>{data.rules.filter((rule) => !rule.paused).length}</strong>
              <span>Active rules</span>
            </Link>
            <Link className="card stat" to="/admin/board">
              <strong>{data.board.PENDING.length}</strong>
              <span>To do this week</span>
            </Link>
            <Link className="card stat" to="/admin/board">
              <strong>{data.board.OVERDUE.length}</strong>
              <span>Overdue</span>
            </Link>
          </section>

          <section className="card">
            <h2>Invite code</h2>
            <p className="muted">Share this so people can join {org.name}.</p>
            <div className="invite">
              <code>{data.details.inviteCode}</code>
              <button
                type="button"
                className="button small"
                onClick={() => copyCode(data.details.inviteCode ?? "")}
              >
                {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Repeat the demo</h2>
            <p className="muted">
              Forgets what was sent today and reopens today's finished tasks.
            </p>
            <button
              type="button"
              className="button small"
              disabled={busy}
              onClick={() =>
                run(
                  "/api/scheduler/reset-today",
                  (reset: { eventsCleared: number; tasksReset: number }) =>
                    `Reset ${plural(reset.eventsCleared, "event")} and ${plural(reset.tasksReset, "task")}.`,
                )
              }
            >
              <RotateCcw aria-hidden size={16} />
              Reset today
            </button>
          </section>
        </div>
      )}
    </>
  );
}
