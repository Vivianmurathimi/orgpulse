import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../../api";
import { AdminNav } from "../../components/AdminNav";
import { Empty, ErrorBox, Loading } from "../../components/States";
import { useMember } from "../../context/AuthContext";
import { useLoad } from "../../hooks/useLoad";
import type { Group, Member } from "../../types";

export function MembersPage() {
  const { org, user } = useMember();
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");

  const roster = useLoad(async () => {
    const [members, groups] = await Promise.all([
      api<Member[]>("/api/orgs/current/members"),
      api<Group[]>("/api/orgs/current/groups"),
    ]);
    return { members, groups };
  }, [org.id]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await roster.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function remove(member: Member) {
    if (window.confirm(`Remove ${member.name} from ${org.name}?`)) {
      void run(() => api(`/api/orgs/current/members/${member.membershipId}`, { method: "DELETE" }));
    }
  }

  function setRole(member: Member, role: Member["role"]) {
    void run(() =>
      api(`/api/orgs/current/members/${member.membershipId}`, { method: "PATCH", body: { role } }),
    );
  }

  function addGroup(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api("/api/orgs/current/groups", { method: "POST", body: { name: groupName } });
      setGroupName("");
    });
  }

  function addToGroup(group: Group, membershipId: string) {
    void run(() =>
      api(`/api/orgs/current/groups/${group.id}/members`, {
        method: "POST",
        body: { membershipIds: [membershipId] },
      }),
    );
  }

  const data = roster.data;

  return (
    <>
      <div className="page-heading">
        <h1>Members</h1>
      </div>
      <AdminNav />

      {roster.loading && !data && <Loading />}
      {roster.error && <ErrorBox message={roster.error} onRetry={roster.reload} />}
      {error && <ErrorBox message={error} />}

      {data && (
        <div className="stack">
          {data.members.map((member) => (
            <article className="card" key={member.membershipId}>
              <div className="row">
                <div>
                  <h2>
                    {member.name}
                    {member.userId === user.id && <span className="muted"> (you)</span>}
                  </h2>
                  {member.groups.length > 0 && (
                    <p className="chips">
                      {member.groups.map((group) => (
                        <span className="chip" key={group.id}>
                          {group.name}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <span className={`status ${member.role === "ADMIN" ? "status-admin" : "status-member"}`}>
                  {member.role === "ADMIN" ? "Admin" : "Member"}
                </span>
              </div>
              <div className="actions">
                {member.role === "MEMBER" ? (
                  <button type="button" className="button small" onClick={() => setRole(member, "ADMIN")}>
                    Make admin
                  </button>
                ) : (
                  <button type="button" className="button small" onClick={() => setRole(member, "MEMBER")}>
                    Make member
                  </button>
                )}
                <button type="button" className="button small danger" onClick={() => remove(member)}>
                  Remove
                </button>
              </div>
            </article>
          ))}

          <h2 className="section-title">Groups</h2>

          {data.groups.length === 0 && (
            <Empty title="No groups yet">Groups let a rule target people like a choir or a team.</Empty>
          )}

          {data.groups.map((group) => {
            const inGroup = data.members.filter(({ membershipId }) =>
              group.membershipIds.includes(membershipId),
            );
            const notInGroup = data.members.filter(
              ({ membershipId }) => !group.membershipIds.includes(membershipId),
            );

            return (
              <article className="card" key={group.id}>
                <h2>{group.name}</h2>
                <p className="muted">
                  {inGroup.map((member) => member.name).join(", ") || "Nobody yet"}
                </p>
                {notInGroup.length > 0 && (
                  <select
                    aria-label={`Add a member to ${group.name}`}
                    value=""
                    onChange={(event) => addToGroup(group, event.target.value)}
                  >
                    <option value="">Add a member...</option>
                    {notInGroup.map((member) => (
                      <option key={member.membershipId} value={member.membershipId}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                )}
              </article>
            );
          })}

          <form className="card inline-form" onSubmit={addGroup}>
            <input
              aria-label="New group name"
              placeholder="New group name"
              required
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
            />
            <button className="button">Add group</button>
          </form>
        </div>
      )}
    </>
  );
}
