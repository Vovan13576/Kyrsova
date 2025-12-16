// client/src/pages/Login.jsx
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost, getErrorMessage } from "../services/api.js";
import { setAuth } from "../services/auth.js";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiPost("/auth/login", { email, password });

      const token = res?.token || res?.accessToken || res?.jwt;
      if (!token) {
        setError("Сервер не повернув token/accessToken/jwt");
        return;
      }

      setAuth(token, res?.user || { email });
      nav("/", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="authCard">
        <h2>Вхід</h2>

        <form onSubmit={onSubmit} className="authForm">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? "Вхід..." : "Увійти"}
          </button>
        </form>

        {error ? <div className="errorBox">{error}</div> : null}

        <div className="muted">
          Немає акаунту? <Link to="/register">Реєстрація</Link>
        </div>
      </div>
    </div>
  );
}
