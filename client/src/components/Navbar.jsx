import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";

export default function Navbar() {
  const { isAuthed, logout } = useAuth();
  const nav = useNavigate();

  const itemStyle = ({ isActive }) => ({
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: isActive ? "rgba(110,168,255,0.22)" : "rgba(255,255,255,0.05)"
  });

  return (
    <div style={{ borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.18)" }}>
      <div className="container" style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
        <Link to="/" style={{ fontWeight: 800 }}>
          Plant Disease Web
        </Link>

        <div className="row" style={{ alignItems: "center" }}>
          <NavLink to="/analyze" style={itemStyle}>Аналіз</NavLink>
          <NavLink to="/history" style={itemStyle}>Історія</NavLink>
          <NavLink to="/folders" style={itemStyle}>Папки</NavLink>

          {!isAuthed ? (
            <>
              <NavLink to="/login" style={itemStyle}>Вхід</NavLink>
              <NavLink to="/register" style={itemStyle}>Реєстрація</NavLink>
            </>
          ) : (
            <button
              className="btn btnDanger"
              onClick={() => {
                logout();
                nav("/login");
              }}
            >
              Вийти
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
