import { NavLink } from "react-router-dom";

export function AdminNav() {
  return (
    <nav className="tabs" aria-label="Admin">
      <NavLink to="/admin" end>
        Overview
      </NavLink>
      <NavLink to="/admin/members">Members</NavLink>
      <NavLink to="/admin/rules">Rules</NavLink>
      <NavLink to="/admin/preview">Preview</NavLink>
      <NavLink to="/admin/board">Board</NavLink>
    </nav>
  );
}
