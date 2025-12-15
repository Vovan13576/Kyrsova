import { BrowserRouter, NavLink, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Analyze from "./pages/Analyze.jsx";
import History from "./pages/History.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import RequireAuth from "./components/RequireAuth.jsx";

function TopBar() {
  const nav = useNavigate();
  const token = localStorage.getItem("token");

  const linkStyle = ({ isActive }) => ({
    color: "white",
    textDecoration: "none",
    fontWeight: 800,
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: isActive ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.18)"
  });

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <div style={{ color: "white", fontWeight: 900, opacity: 0.95 }}>Plant Disease Detection</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <NavLink to="/" style={linkStyle}>Аналіз</NavLink>
        <NavLink to="/history" style={linkStyle}>Перевірені</NavLink>

        {!token ? (
          <>
            <button className="btn" onClick={() => nav("/login")}>Увійти</button>
            <button className="btn" onClick={() => nav("/register")}>Реєстрація</button>
          </>
        ) : (
          <button
            className="btn"
            onClick={() => {
              localStorage.removeItem("token");
              nav("/login");
            }}
          >
            Вийти
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        <TopBar />

        <Routes>
          <Route path="/" element={<Analyze />} />

          <Route
            path="/history"
            element={
              <RequireAuth>
                <History />
              </RequireAuth>
            }
          />

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
