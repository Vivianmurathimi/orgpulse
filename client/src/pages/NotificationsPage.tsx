import { useState } from "react";
import { api, errorMessage } from "../api";
import { Empty, ErrorBox, Loading } from "../components/States";
import { useMember } from "../context/AuthContext";
import { useRealtime, useSocketEvent } from "../context/RealtimeContext";
import { useLoad } from "../hooks/useLoad";
import { formatAgo } from "../lib/dates";
import type { Notification, SwapRequest } from "../types";

export function NotificationsPage() {
  const { org } = useMember();
  const { refreshUnread } = useRealtime();
  const [actionError, setActionError] = useState<string | null>(null);

  const history = useLoad(async () => {
    const [notifications, openSwaps] = await Promise.all([
      api<Notification[]>("/api/notifications"),
      api<SwapRequest[]>("/api/swaps/open"),
    ]);
    return { notifications, openSwapIds: new Set(openSwaps.map(({ id }) => id)) };
  }, [org.id]);

  useSocketEvent("notification:new", () => void history.reload());
  useSocketEvent("connect", () => void history.reload()); // catch up after a lost connection

  async function run(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      await Promise.all([history.reload(), refreshUnread()]);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  const items = history.data?.notifications ?? [];
  const hasUnread = items.some((item) => !item.read);

  return (
    <>
      <div className="page-heading row">
        <h1>Alerts</h1>
        {hasUnread && (
          <button
            type="button"
            className="button small"
            onClick={() => run(() => api("/api/notifications/read-all", { method: "POST" }))}
          >
            Mark all read
          </button>
        )}
      </div>

      {history.loading && !history.data && <Loading />}
      {history.error && <ErrorBox message={history.error} onRetry={history.reload} />}
      {actionError && <ErrorBox message={actionError} />}

      {history.data && items.length === 0 && (
        <Empty title="No notifications yet">They'll appear here as they arrive.</Empty>
      )}

      {history.data && (
        <ul className="list">
          {items.map((item) => {
            const swapId = item.data?.swapId;
            const swapOpen = swapId !== undefined && history.data!.openSwapIds.has(swapId);

            return (
              <li className={`list-item ${item.read ? "" : "unread"}`} key={item.id}>
                <button
                  type="button"
                  className="list-main"
                  disabled={item.read}
                  onClick={() =>
                    run(() => api(`/api/notifications/${item.id}/read`, { method: "PATCH" }))
                  }
                >
                  <span>{item.message}</span>
                  <small className="muted">{formatAgo(item.createdAt)}</small>
                </button>

                {swapOpen && (
                  <div className="actions">
                    <button
                      type="button"
                      className="button small primary"
                      onClick={() =>
                        run(() =>
                          api(`/api/swaps/${swapId}`, {
                            method: "PATCH",
                            body: { action: "accept" },
                          }),
                        )
                      }
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="button small"
                      onClick={() =>
                        run(() =>
                          api(`/api/swaps/${swapId}`, {
                            method: "PATCH",
                            body: { action: "decline" },
                          }),
                        )
                      }
                    >
                      Decline
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
