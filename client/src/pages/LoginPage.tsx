import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api";
import { ErrorBox } from "../components/States";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password); // the login route then redirects to Today
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <img src="/favicon.svg" alt="" width="52" height="52" />
        <h1>OrgPulse</h1>
        <p className="muted">Rules instead of calendar entries.</p>
      </div>

      <form className="card form" onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Logging in..." : "Log in"}
        </button>
      </form>

      <p className="auth-switch">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}
