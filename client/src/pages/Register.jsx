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

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ ТІ САМІ стилі, що в Login.jsx (1-в-1)
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
        background:
          "linear-gradient(180deg, rgba(70,120,255,0.35), rgba(40,90,220,0.22))",
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
      success: {
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(80, 255, 170, 0.10)",
        border: "1px solid rgba(80, 255, 170, 0.22)",
        color: "rgba(210,255,235,0.95)",
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
      const res = await apiPost("/auth/register", { email, password });

      // інколи сервер може віддати токен одразу
      const token = extractToken(res);

      if (token) {
        localStorage.setItem("pdw_token", token);
        localStorage.setItem("token", token);
        localStorage.setItem("accessToken", token);

        const user = res?.user || res?.data?.user || res?.result?.user || null;
        if (user) localStorage.setItem("pdw_user", JSON.stringify(user));

        navigate("/history");
        return;
      }

      // якщо токена нема — просто ведемо на логін
      // (або показуємо відповідь, щоб точно знати формат)
      const ok =
        res?.ok === true ||
        res?.success === true ||
        res?.message ||
        res?.result;

      if (!ok) {
        console.log("REGISTER RESPONSE (UNEXPECTED):", res);
        setErr(
          "Сервер відповів, але формат неочікуваний.\n\n" +
            "Відповідь сервера:\n" +
            safeStringify(res)
        );
        setLoading(false);
        return;
      }

      navigate("/login");
    } catch (e2) {
      console.error("REGISTER ERROR:", e2);
      const msg =
        e2?.message ||
        e2?.error ||
        (typeof e2 === "string" ? e2 : "Помилка реєстрації");
      setErr(String(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Реєстрація</h2>

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
            autoComplete="new-password"
            required
          />

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? "Реєстрація..." : "Зареєструватися"}
          </button>

          {err ? <div style={styles.error}>{err}</div> : null}

          <div style={styles.hint}>
            Вже є акаунт?{" "}
            <Link to="/login" style={styles.link}>
              Вхід
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
