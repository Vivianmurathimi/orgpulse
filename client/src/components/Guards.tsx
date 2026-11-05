import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loading } from "./States";

// Each guard sends you to the right place if you can't see the pages inside it

export function RequireLogin() {
  const { session, ready } = useAuth();
  if (!session && !ready) return <Loading />;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

export function RequireOrg() {
  const { org } = useAuth();
  return org ? <Outlet /> : <Navigate to="/start" replace />;
}

export function RequireAdmin() {
  const { org } = useAuth();
  return org?.role === "ADMIN" ? <Outlet /> : <Navigate to="/" replace />;
}

// For login and register: someone already logged in has no reason to be there
export function RequireLoggedOut() {
  const { session } = useAuth();
  return session ? <Navigate to="/" replace /> : <Outlet />;
}
