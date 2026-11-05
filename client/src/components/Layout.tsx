import { Bell, CalendarDays, House, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth, useMember } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { Toasts } from "./Toasts";

// The frame around every page once you're in an organisation.
// CSS turns the navigation into a bottom bar on phones and a top bar on wide screens.
export function Layout() {
  const { logout } = useAuth();
  const { org } = useMember();
  const { unread, connected } = useRealtime();

  // The socket takes a moment to connect, so only warn if it stays disconnected
  const [showOffline, setShowOffline] = useState(false);
  useEffect(() => {
    if (connected) {
      setShowOffline(false);
      return;
    }
    const timer = setTimeout(() => setShowOffline(true), 2000);
    return () => clearTimeout(timer);
  }, [connected]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <div>
            <strong>OrgPulse</strong>
            <span className="brand-org">{org.name}</span>
          </div>
        </div>

        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            <House aria-hidden size={22} />
            <span>Today</span>
          </NavLink>
          <NavLink to="/upcoming">
            <CalendarDays aria-hidden size={22} />
            <span>Upcoming</span>
          </NavLink>
          <NavLink to="/notifications">
            <span className="nav-icon">
              <Bell aria-hidden size={22} />
              {unread > 0 && (
                <span className="badge-count" aria-label={`${unread} unread`}>
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <span>Alerts</span>
          </NavLink>
          <NavLink to="/settings">
            <Settings aria-hidden size={22} />
            <span>Settings</span>
          </NavLink>
          {org.role === "ADMIN" && (
            <NavLink to="/admin">
              <ShieldCheck aria-hidden size={22} />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        <button type="button" className="logout" onClick={logout}>
          <LogOut aria-hidden size={18} />
          Log out
        </button>
      </header>

      {showOffline && (
        <p className="offline" role="status">
          Reconnecting... live updates are paused.
        </p>
      )}

      <main className="page">
        <Outlet />
      </main>

      <Toasts />
    </div>
  );
}
