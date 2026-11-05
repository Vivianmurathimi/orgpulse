import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../api";
import { ErrorBox } from "../components/States";
import { useAuth } from "../context/AuthContext";

export function RegisterPage() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthday, setBirthday] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ name, email, password, birthday: birthday || undefined });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <img src="/favicon.svg" alt="" width="52" height="52" />
        <h1>Create your account</h1>
      </div>

      <form className="card form" onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        <label>
          Name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <small className="muted">At least 8 characters</small>
        </label>
        <label>
          Birthday (optional)
          <input
            type="date"
            value={birthday}
            onChange={(event) => setBirthday(event.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Creating..." : "Create account"}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
