import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { getErrorMessage } from "../services/api.js";
import { setAuth } from "../services/auth.js";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    if (!email || !password) {
      setErr("Введи email та пароль.");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post("/auth/login", { email, password });

      // ✅ підтримка різних форматів
      const token = res?.token || res?.accessToken || res?.jwt || "";
      const user = res?.user || null;

      if (!token) {
        console.log("Login response was:", res);
        setErr("Сервер не повернув token/accessToken/jwt");
        return;
      }

      setAuth(token, user);

      // після логіну — на головну (або на /history якщо хочеш)
      nav("/");
    } catch (e2) {
      setErr(getErrorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", padding: 24 }}>
      <div
        style={{
          width: "min(520px, 95vw)",
          padding: 18,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Вхід</div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              outline: "none",
            }}
          />

          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            type="password"
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              outline: "none",
            }}
          />

          <button
            type="submit"
            disabled={busy}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {busy ? "Вхід..." : "Увійти"}
          </button>
        </form>

        {err ? (
          <div style={{ marginTop: 12, color: "#ffb3b3", fontWeight: 700 }}>
            {err}
          </div>
        ) : null}

        <div style={{ marginTop: 10, opacity: 0.85 }}>
          Немає акаунту? <Link to="/register">Реєстрація</Link>
        </div>
      </div>
    </div>
  );
}
