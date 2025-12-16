import React, { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiPost } from "../services/api.js";

function safeStringify(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function extractToken(res) {
  return (
    res?.token ||
    res?.accessToken ||
    res?.jwt ||
    res?.data?.token ||
    res?.data?.accessToken ||
    res?.data?.jwt ||
    res?.result?.token ||
    res?.result?.accessToken ||
    res?.result?.jwt ||
    res?.user?.token ||
    res?.user?.accessToken ||
    ""
  );
}

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const styles = useMemo(() => {
    return {
      page: {
        minHeight: "calc(100vh - 80px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      },
      card: {
        width: "min(560px, 92vw)",
        background: "rgba(25, 35, 50, 0.55)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        backdropFilter: "blur(10px)",
        padding: 22,
      },
      title: {
        margin: "0 0 14px 0",
        fontSize: 28,
        fontWeight: 800,
        color: "#fff",
        letterSpacing: 0.2,
      },
      row: {
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 12,
        marginTop: 10,
      },
      input: {
        width: "100%",
        height: 46,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.07)",
        color: "#fff",
        padding: "0 14px",
        outline: "none",
        fontSize: 15,
      },
      button: {
        height: 46,
        borderRadius: 12,
        border: "1px solid rgba(120,170,255,0.35)",
        background: "linear-gradient(180deg, rgba(70,120,255,0.35), rgba(40,90,220,0.22))",
        color: "#fff",
        fontWeight: 800,
        letterSpacing: 0.3,
        cursor: "pointer",
      },
      hint: {
        marginTop: 12,
        color: "rgba(255,255,255,0.75)",
        fontSize: 14,
      },
      link: {
        color: "#aecdff",
        textDecoration: "underline",
        fontWeight: 700,
      },
      error: {
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255, 80, 80, 0.10)",
        border: "1px solid rgba(255, 80, 80, 0.25)",
        color: "#ffb4b4",
        fontWeight: 800,
        whiteSpace: "pre-wrap",
      },
    };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;

    setErr("");
    setLoading(true);

    try {
      const res = await apiPost("/auth/login", { email, password });

      // ✅ дістаємо токен
      const token = extractToken(res);

      // Якщо токена нема — покажемо відповідь (щоб ми точно знали як сервер віддає)
      if (!token) {
        console.log("LOGIN RESPONSE (NO TOKEN):", res);
        setErr(
          "Сервер повернув 200, але не віддав token/accessToken/jwt.\n\n" +
            "Відповідь сервера:\n" +
            safeStringify(res)
        );
        setLoading(false);
        return;
      }

      // ✅ максимально сумісно: кладемо в кілька ключів
      localStorage.setItem("pdw_token", token);
      localStorage.setItem("token", token);
      localStorage.setItem("accessToken", token);

      // user (якщо є)
      const user = res?.user || res?.data?.user || res?.result?.user || null;
      if (user) localStorage.setItem("pdw_user", JSON.stringify(user));

      // ✅ переходи
      navigate("/history");
    } catch (e2) {
      console.error("LOGIN ERROR:", e2);
      const msg =
        e2?.message ||
        e2?.error ||
        (typeof e2 === "string" ? e2 : "Помилка входу");
      setErr(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Вхід</h2>

        <form onSubmit={onSubmit} style={styles.row}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <input
            style={styles.input}
            type="password"
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? "Вхід..." : "Увійти"}
          </button>

          {err ? <div style={styles.error}>{err}</div> : null}

          <div style={styles.hint}>
            Немає акаунту?{" "}
            <Link to="/register" style={styles.link}>
              Реєстрація
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
