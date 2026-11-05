import { Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api";
import { ErrorBox, Loading } from "../components/States";
import { useAuth, useMember } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { useLoad } from "../hooks/useLoad";
import { formatDay } from "../lib/dates";
import type { Category, Preference } from "../types";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "BIRTHDAY", label: "Birthdays" },
  { value: "TASK", label: "New duties" },
  { value: "REMINDER", label: "Reminders" },
  { value: "SWAP", label: "Swaps" },
  { value: "STATUS", label: "Task updates" },
];

export function SettingsPage() {
  const { session, switchOrg, logout } = useAuth();
  const { org } = useMember();
  const memberships = session?.memberships ?? [];

  return (
    <>
      <div className="page-heading">
        <h1>Settings</h1>
      </div>

      <div className="stack">
        <ProfileSection />
        <UnavailableSection />
        <PreferencesSection />

        <section className="card form">
          <h2>Organisation</h2>
          {memberships.length > 1 && (
            <label>
              Current organisation
              <select value={org.id} onChange={(event) => void switchOrg(event.target.value)}>
                {memberships.map((membership) => (
                  <option key={membership.orgId} value={membership.orgId}>
                    {membership.orgName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Link className="button" to="/start">
            Join or create another
          </Link>
          <button type="button" className="button danger" onClick={logout}>
            Log out
          </button>
        </section>
      </div>
    </>
  );
}

function ProfileSection() {
  const { refresh } = useAuth();
  const { user } = useMember();
  const { showToast } = useRealtime();

  const [name, setName] = useState(user.name);
  const [birthday, setBirthday] = useState(user.birthday ?? "");
  const [showBirthday, setShowBirthday] = useState(user.showBirthday);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/api/auth/me", {
        method: "PATCH",
        body: { name, birthday: birthday || null, showBirthday },
      });
      await refresh();
      showToast("Profile saved");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="card form" onSubmit={save}>
      <h2>Profile</h2>
      {error && <ErrorBox message={error} />}
      <label>
        Name
        <input required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Birthday
        <input type="date" value={birthday} onChange={(event) => setBirthday(event.target.value)} />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={showBirthday}
          onChange={(event) => setShowBirthday(event.target.checked)}
        />
        Show my birthday to others
      </label>
      <button className="button primary">Save profile</button>
    </form>
  );
}

interface Period {
  id: string;
  from: string;
  to: string;
}

function UnavailableSection() {
  const periods = useLoad(() => api<Period[]>("/api/auth/me/unavailable"));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await periods.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api("/api/auth/me/unavailable", { method: "POST", body: { from, to } });
      setFrom("");
      setTo("");
    });
  }

  return (
    <section className="card form">
      <h2>Unavailable dates</h2>
      <p className="muted">Rotations pass to the next person, and you keep your place.</p>
      {periods.loading && !periods.data && <Loading />}
      {periods.error && <ErrorBox message={periods.error} onRetry={periods.reload} />}
      {error && <ErrorBox message={error} />}

      {periods.data && periods.data.length > 0 && (
        <ul className="plain-list">
          {periods.data.map((period) => (
            <li key={period.id} className="row">
              <span>
                {formatDay(period.from)} to {formatDay(period.to)}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${period.from} to ${period.to}`}
                onClick={() =>
                  void run(() => api(`/api/auth/me/unavailable/${period.id}`, { method: "DELETE" }))
                }
              >
                <Trash2 aria-hidden size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="form" onSubmit={add}>
        <div className="two-columns">
          <label>
            From
            <input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            To
            <input type="date" required value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        <button className="button">Add dates</button>
      </form>
    </section>
  );
}

function PreferencesSection() {
  const { showToast } = useRealtime();
  const saved = useLoad(() => api<Preference>("/api/preferences"));

  const [quietFrom, setQuietFrom] = useState("");
  const [quietTo, setQuietTo] = useState("");
  const [muted, setMuted] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saved.data) return;
    setQuietFrom(saved.data.quietFrom ?? "");
    setQuietTo(saved.data.quietTo ?? "");
    setMuted(saved.data.mutedCategories);
  }, [saved.data]);

  function toggle(category: Category, on: boolean) {
    setMuted((current) =>
      on ? [...current, category] : current.filter((item) => item !== category),
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/api/preferences", {
        method: "PUT",
        body: {
          quietFrom: quietFrom || null,
          quietTo: quietTo || null,
          mutedCategories: muted,
        },
      });
      showToast("Preferences saved");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form className="card form" onSubmit={save}>
      <h2>Notifications</h2>
      <p className="muted">Quiet or muted notifications still appear in Alerts.</p>
      {saved.error && <ErrorBox message={saved.error} onRetry={saved.reload} />}
      {error && <ErrorBox message={error} />}

      <div className="two-columns">
        <label>
          Quiet from
          <input type="time" value={quietFrom} onChange={(event) => setQuietFrom(event.target.value)} />
        </label>
        <label>
          Quiet until
          <input type="time" value={quietTo} onChange={(event) => setQuietTo(event.target.value)} />
        </label>
      </div>

      <fieldset>
        <legend>Mute</legend>
        {CATEGORIES.map(({ value, label }) => (
          <label className="check" key={value}>
            <input
              type="checkbox"
              checked={muted.includes(value)}
              onChange={(event) => toggle(value, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <button className="button primary">Save preferences</button>
    </form>
  );
}
