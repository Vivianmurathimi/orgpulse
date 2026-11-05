import { api } from "../../api";
import { AdminNav } from "../../components/AdminNav";
import { ErrorBox, Loading } from "../../components/States";
import { useMember } from "../../context/AuthContext";
import { useRealtime, useSocketEvent } from "../../context/RealtimeContext";
import { useLoad } from "../../hooks/useLoad";
import { formatMoment } from "../../lib/dates";
import type { Board, Member, Task } from "../../types";

const COLUMNS = [
  { key: "OVERDUE", label: "Overdue" },
  { key: "PENDING", label: "To do" },
  { key: "DONE", label: "Done" },
  { key: "SKIPPED", label: "Skipped" },
] as const;

export function BoardPage() {
  const { org } = useMember();
  const { connected } = useRealtime();

  const board = useLoad(async () => {
    const [tasks, members] = await Promise.all([
      api<Board>("/api/tasks/board"),
      api<Member[]>("/api/orgs/current/members"),
    ]);
    return { tasks, members };
  }, [org.id]);

  // This is what makes the board live: any task change reloads it, without a refresh
  useSocketEvent("task:updated", () => void board.reload());
  useSocketEvent("connect", () => void board.reload()); // catch up after a lost connection

  function names(task: Task): string {
    if (task.assigneeIds.length === 0) return "Unassigned";
    return task.assigneeIds
      .map(
        (id) => board.data?.members.find((member) => member.userId === id)?.name ?? "Someone who left",
      )
      .join(", ");
  }

  return (
    <>
      <div className="page-heading row">
        <div>
          <h1>Status board</h1>
          <p className="muted">This week</p>
        </div>
        <span className={`live ${connected ? "on" : ""}`}>{connected ? "Live" : "Reconnecting"}</span>
      </div>
      <AdminNav />

      {board.loading && !board.data && <Loading />}
      {board.error && <ErrorBox message={board.error} onRetry={board.reload} />}

      {board.data && (
        <div className="board">
          {COLUMNS.map(({ key, label }) => {
            const tasks = board.data!.tasks[key];

            return (
              <section className={`column column-${key.toLowerCase()}`} key={key}>
                <h2>
                  {label} <span className="muted">{tasks.length}</span>
                </h2>
                {tasks.length === 0 && <p className="muted">Nothing here</p>}
                {tasks.map((task) => (
                  <article className="card" key={task.id}>
                    <h3>{task.title}</h3>
                    <p className="muted">{names(task)}</p>
                    <p className="muted">{formatMoment(task.dueAt, org.timezone)}</p>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
