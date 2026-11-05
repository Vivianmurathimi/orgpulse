import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api";
import { ErrorBox } from "../components/States";
import { useAuth } from "../context/AuthContext";

// Shown to people with no organisation yet. Also reachable from Settings to join another.
export function StartPage() {
  const { adoptToken, logout, org } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(
    event: FormEvent,
    path: string,
    body: object,
    destination: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api<{ token: string }>(path, { method: "POST", body });
      await adoptToken(token);
      navigate(destination);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <img src="/favicon.svg" alt="" width="52" height="52" />
        <h1>{org ? "Add an organisation" : "Let's get you set up"}</h1>
      </div>

      {error && <ErrorBox message={error} />}

      <form
        className="card form"
        onSubmit={(event) => submit(event, "/api/orgs/join", { inviteCode: code }, "/")}
      >
        <h2>Join with an invite code</h2>
        <p className="muted">Ask your organisation's admin for the 6-character code.</p>
        <label>
          Invite code
          <input
            className="code-input"
            required
            maxLength={6}
            autoCapitalize="characters"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <button className="button primary" disabled={busy}>
          Join
        </button>
      </form>

      <form
        className="card form"
        onSubmit={(event) => submit(event, "/api/orgs", { name }, "/admin")}
      >
        <h2>Create an organisation</h2>
        <p className="muted">You'll become its admin and get a code to share.</p>
        <label>
          Organisation name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button className="button" disabled={busy}>
          Create organisation
        </button>
      </form>

      <p className="auth-switch">
        {org ? (
          <Link to="/">Back to {org.name}</Link>
        ) : (
          <button type="button" className="link" onClick={logout}>
            Log out
          </button>
        )}
      </p>
    </div>
  );
}
