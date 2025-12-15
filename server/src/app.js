import { BrowserRouter, NavLink, Routes, Route, Navigate } from "react-router-dom";
import Analyze from "./pages/Analyze";
import History from "./pages/History";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
          <div style={{ color: "white", fontWeight: 900, opacity: 0.9 }}>Plant Disease Detection</div>

          <div style={{ display: "flex", gap: 10 }}>
            <NavLink
              to="/"
              style={({ isActive }) => ({
                color: "white",
                textDecoration: "none",
                fontWeight: 800,
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: isActive ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.18)",
              })}
            >
              Аналіз
            </NavLink>

            <NavLink
              to="/history"
              style={({ isActive }) => ({
                color: "white",
                textDecoration: "none",
                fontWeight: 800,
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: isActive ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.18)",
              })}
            >
              Перевірені
            </NavLink>
          </div>
        </div>

        <Routes>
          <Route path="/" element={<Analyze />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
