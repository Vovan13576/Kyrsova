import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import api, { getErrorMessage } from "../services/api.js";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });
      const token = data?.token || data?.accessToken || data?.jwt;

      if (!token) {
        throw new Error("Сервер не повернув token/accessToken/jwt");
      }

      localStorage.setItem("token", token);

      const back = loc.state?.from || "/history";
      nav(back);
    } catch (e2) {
      setErr(getErrorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Вхід</div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          className="input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="input"
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="btn" disabled={busy}>
          {busy ? "Вхід..." : "Увійти"}
        </button>

        {err ? <div style={{ color: "#ffb4b4", fontWeight: 900 }}>{err}</div> : null}

        <div style={{ opacity: 0.85 }}>
          Немає акаунту? <Link to="/register">Реєстрація</Link>
        </div>
      </form>
    </div>
  );
}
