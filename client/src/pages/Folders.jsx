import React, { useEffect, useState } from "react";
import Layout from "../components/Layout.jsx";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import { createFolder, fetchFolders } from "../services/folders.js";

export default function Folders() {
  const [folders, setFolders] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setErr("");
    setBusy(true);
    try {
      const res = await fetchFolders();
      const data = res.data?.items || res.data || [];
      setFolders(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Помилка завантаження папок");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onCreate = async () => {
    const n = name.trim();
    if (!n) return;
    setCreating(true);
    setErr("");
    try {
      await createFolder(n);
      setName("");
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Помилка створення папки");
    } finally {
      setCreating(false);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <div className="card">
          <h1 className="h1">Папки</h1>

          <div className="row">
            <div className="col card">
              <label className="small muted">Нова папка</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Наприклад: Помідори" />
              <div style={{ marginTop: 10 }}>
                <button className="btn" onClick={onCreate} disabled={creating}>
                  {creating ? "Створення..." : "Створити"}
                </button>
              </div>
            </div>

            <div className="col card">
              <div className="badge">Список</div>
              <div className="hr" />

              {busy && <p className="muted">Завантаження...</p>}
              {err && <div className="badge" style={{ borderColor: "rgba(255,107,107,0.5)" }}>{err}</div>}
              {!busy && !err && folders.length === 0 && <p className="muted">Папок ще немає.</p>}

              {!busy && folders.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {folders.map((f, idx) => (
                    <li key={f.id || f.folderId || idx}>
                      <span>{f.name || f.title || `Папка #${idx + 1}`}</span>
                      {f.id && <span className="badge" style={{ marginLeft: 8 }}>id: {f.id}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
