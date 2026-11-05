import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../api";
import { AdminNav } from "../../components/AdminNav";
import { Empty, ErrorBox, Loading } from "../../components/States";
import { useMember } from "../../context/AuthContext";
import { useLoad } from "../../hooks/useLoad";
import { describeSchedule, RULE_TYPE_LABEL } from "../../lib/rules";
import type { Rule } from "../../types";

export function RulesPage() {
  const { org } = useMember();
  const rules = useLoad(() => api<Rule[]>("/api/rules"), [org.id]);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await rules.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function remove(rule: Rule) {
    if (window.confirm(`Delete "${rule.title}"? This also deletes its task history.`)) {
      void run(() => api(`/api/rules/${rule.id}`, { method: "DELETE" }));
    }
  }

  return (
    <>
      <div className="page-heading row">
        <h1>Rules</h1>
        <Link className="button small primary" to="/admin/rules/new">
          <Plus aria-hidden size={16} />
          New rule
        </Link>
      </div>
      <AdminNav />

      {rules.loading && !rules.data && <Loading />}
      {rules.error && <ErrorBox message={rules.error} onRetry={rules.reload} />}
      {error && <ErrorBox message={error} />}

      {rules.data && rules.data.length === 0 && (
        <Empty title="No rules yet">Create one rule, and OrgPulse does the rest.</Empty>
      )}

      {rules.data && (
        <div className="stack">
          {rules.data.map((rule) => (
            <article className={`card ${rule.paused ? "paused" : ""}`} key={rule.id}>
              <div className="row">
                <div>
                  <h2>{rule.title}</h2>
                  <p className="muted">{describeSchedule(rule)}</p>
                </div>
                <span className="status status-member">
                  {rule.paused ? "Paused" : RULE_TYPE_LABEL[rule.type]}
                </span>
              </div>
              <div className="actions">
                <Link className="button small" to={`/admin/rules/${rule.id}`}>
                  Edit
                </Link>
                <button
                  type="button"
                  className="button small"
                  onClick={() =>
                    run(() =>
                      api(`/api/rules/${rule.id}`, {
                        method: "PATCH",
                        body: { paused: !rule.paused },
                      }),
                    )
                  }
                >
                  {rule.paused ? "Resume" : "Pause"}
                </button>
                <button type="button" className="button small danger" onClick={() => remove(rule)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
