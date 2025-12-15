import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../services/api.js";

export default function Register() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      await api.post("/auth/register", { email, password });
      nav("/login");
    } catch (e2) {
      setErr(getErrorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>Реєстрація</div>

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
          {busy ? "Створення..." : "Зареєструватися"}
        </button>

        {err ? <div style={{ color: "#ffb4b4", fontWeight: 900 }}>{err}</div> : null}

        <div style={{ opacity: 0.85 }}>
          Вже є акаунт? <Link to="/login">Вхід</Link>
        </div>
      </form>
    </div>
  );
}
