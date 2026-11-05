import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, setApiToken, setUnauthorizedHandler } from "../api";
import type { Membership, Org, Role, User } from "../types";

// Who is logged in. Kept in localStorage so a page refresh doesn't log you out.

const STORAGE_KEY = "orgpulse.session";

export interface CurrentOrg extends Org {
  role: Role;
}

interface Session {
  token: string;
  user: User;
  memberships: Membership[];
  org: CurrentOrg | null;
}

interface AuthValue {
  session: Session | null;
  ready: boolean; // false while checking a saved session
  org: CurrentOrg | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; birthday?: string }) => Promise<void>;
  adoptToken: (token: string) => Promise<void>;
  switchOrg: (orgId: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function loadSession(): Session | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private browsing can block storage. The app still works until a refresh.
  }
}

// Reads the token's contents. The server checks tokens; this is only for display logic.
function readToken(token: string): { orgId?: string; role?: Role } {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)) as { orgId?: string; role?: Role };
  } catch {
    return {};
  }
}

// Builds a session from a token. A token can be out of date (a changed role, or a
// removed member), so compare it with the server's answer and get a new one if needed.
async function buildSession(startToken: string): Promise<Session> {
  let token = startToken;
  setApiToken(token);

  const { user, memberships } = await api<{ user: User; memberships: Membership[] }>("/api/auth/me");

  const claims = readToken(token);
  const membership =
    memberships.find(({ orgId }) => orgId === claims.orgId) ?? memberships[0] ?? null;

  if (membership && (membership.orgId !== claims.orgId || membership.role !== claims.role)) {
    const fresh = await api<{ token: string }>("/api/auth/switch-org", {
      method: "POST",
      body: { orgId: membership.orgId },
    });
    token = fresh.token;
    setApiToken(token);
  }

  let org: CurrentOrg | null = null;
  if (membership) {
    org = { ...(await api<Org>("/api/orgs/current")), role: membership.role };
  }
  return { token, user, memberships, org };
}

// Runs once, while the page loads. Pages fetch their data as soon as they appear,
// which is before any useEffect here, so the token must already be in place by then.
const startingSession = loadSession();
setApiToken(startingSession?.token ?? null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(startingSession);
  const [ready, setReady] = useState(false);

  const apply = useCallback((next: Session | null) => {
    setApiToken(next?.token ?? null);
    saveSession(next);
    setSession(next);
  }, []);

  const logout = useCallback(() => apply(null), [apply]);

  const adoptToken = useCallback(
    async (token: string) => apply(await buildSession(token)),
    [apply],
  );

  // On startup, check that a saved session is still good
  useEffect(() => {
    setUnauthorizedHandler(logout);

    if (!startingSession) {
      setReady(true);
      return;
    }
    buildSession(startingSession.token)
      .then(apply)
      .catch((err: unknown) => {
        // The saved account no longer exists, e.g. the database was reset.
        // A network problem keeps the session, and a bad token has already logged out.
        if (err instanceof ApiError && err.status === 404) logout();
      })
      .finally(() => setReady(true));
  }, [apply, logout]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      ready,
      org: session?.org ?? null,
      adoptToken,
      logout,
      login: async (email, password) => {
        setApiToken(null);
        const { token } = await api<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { email, password },
        });
        await adoptToken(token);
      },
      register: async (data) => {
        setApiToken(null);
        const { token } = await api<{ token: string }>("/api/auth/register", {
          method: "POST",
          body: data,
        });
        await adoptToken(token);
      },
      switchOrg: async (orgId) => {
        const { token } = await api<{ token: string }>("/api/auth/switch-org", {
          method: "POST",
          body: { orgId },
        });
        await adoptToken(token);
      },
      refresh: async () => {
        if (session) await adoptToken(session.token);
      },
    }),
    [session, ready, adoptToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

// For pages that only appear once the user is logged in and in an organisation
export function useMember() {
  const { session, org } = useAuth();
  if (!session || !org) throw new Error("useMember needs a logged-in member");
  return { user: session.user, org };
}
