import { useState } from "react";
import { api, errorMessage } from "../../api";
import { AdminNav } from "../../components/AdminNav";
import { Empty, ErrorBox, Loading } from "../../components/States";
import { useMember } from "../../context/AuthContext";
import { useLoad } from "../../hooks/useLoad";
import { formatDay } from "../../lib/dates";
import { RULE_TYPE_LABEL } from "../../lib/rules";
import type { PreviewRow } from "../../types";

export function PreviewPage() {
  const { org } = useMember();
  const preview = useLoad(() => api<PreviewRow[]>("/api/rules/preview?days=7"), [org.id]);
  const [error, setError] = useState<string | null>(null);

  async function skip(row: PreviewRow) {
    if (!window.confirm(`Skip ${row.ruleTitle} on ${formatDay(row.date)}?`)) return;

    setError(null);
    try {
      await api(`/api/rules/${row.ruleId}/skip`, { method: "POST", body: { date: row.date } });
      await preview.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const dates = [...new Set(preview.data?.map((row) => row.date) ?? [])];

  return (
    <>
      <div className="page-heading">
        <h1>Next 7 days</h1>
        <p className="muted">What will happen. Nothing here has been sent.</p>
      </div>
      <AdminNav />

      {preview.loading && !preview.data && <Loading />}
      {preview.error && <ErrorBox message={preview.error} onRetry={preview.reload} />}
      {error && <ErrorBox message={error} />}

      {preview.data && dates.length === 0 && (
        <Empty title="A quiet week">Nothing is due in the next 7 days.</Empty>
      )}

      <div className="stack">
        {dates.map((date) => (
          <section key={date}>
            <h2 className="section-title">{formatDay(date)}</h2>
            <div className="stack tight">
              {preview.data
                ?.filter((row) => row.date === date)
                .map((row) => (
                  <article className="card" key={`${row.ruleId}:${row.who.join()}`}>
                    <div className="row">
                      <div>
                        <h3>{row.ruleTitle}</h3>
                        <p className="muted">{row.who.join(", ") || "Nobody available"}</p>
                      </div>
                      <span className="status status-member">{RULE_TYPE_LABEL[row.type]}</span>
                    </div>
                    {row.type !== "BIRTHDAY" && (
                      <button type="button" className="button small" onClick={() => skip(row)}>
                        Skip this one
                      </button>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
