import React, { useEffect, useMemo, useState } from "react";
import api from "../services/api.js";
import { isAuthed } from "../services/auth.js";

export default function History() {
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState("all"); // all | unassigned | folder:<id>
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [banner, setBanner] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((x) => {
      const a = `${x.plantName || ""} ${x.diseaseName || ""} ${x.predictedKey || ""}`.toLowerCase();
      return a.includes(s);
    });
  }, [items, q]);

  async function loadFolders() {
    if (!isAuthed()) return setFolders([]);
    try {
      const r = await api.get("/folders");
      setFolders(r.items || []);
    } catch (e) {
      setFolders([]);
    }
  }

  async function loadHistory() {
    setBanner("");
    if (!isAuthed()) {
      setBanner("Щоб бачити «Мої перевірені», потрібно увійти (401 = неавторизовано).");
      setItems([]);
      return;
    }

    try {
      let r;
      if (activeFolder === "all") r = await api.get("/history");
      else if (activeFolder === "unassigned") r = await api.get("/history/unassigned");
      else if (activeFolder.startsWith("folder:")) {
        const id = activeFolder.split(":")[1];
        r = await api.get(`/history/folder/${id}`);
      } else r = await api.get("/history");

      setItems(r.items || []);
    } catch (e) {
      setBanner(e?.message || "Помилка завантаження історії");
      setItems([]);
    }
  }

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    loadHistory();
  }, [activeFolder]);

  async function moveItem(savedId, newFolderId) {
    try {
      await api.put(`/history/${savedId}/move`, { folderId: newFolderId });
      await loadHistory();
    } catch (e) {
      setBanner(e?.message || "Не вдалося перемістити");
    }
  }

  async function deleteItem(savedId) {
    try {
      await api.del(`/history/${savedId}`);
      await loadHistory();
    } catch (e) {
      setBanner(e?.message || "Не вдалося видалити");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      {banner ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: banner.toLowerCase().includes("увійти") ? "#3b1d1d" : "#1f2a36",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {banner}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <div style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ marginBottom: 10, fontWeight: 700 }}>Папки</div>

          <button
            style={{ width: "100%", marginBottom: 10 }}
            onClick={() => setActiveFolder("all")}
          >
            Усі
          </button>

          <button style={{ width: "100%", marginBottom: 10 }} onClick={() => setActiveFolder("unassigned")}>
            Без папки
          </button>

          {folders.map((f) => (
            <button
              key={f.id}
              style={{ width: "100%", marginBottom: 10 }}
              onClick={() => setActiveFolder(`folder:${f.id}`)}
            >
              {f.name}
            </button>
          ))}
        </div>

        <div style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Мої перевірені</div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Пошук..."
              style={{ flex: 1, minWidth: 220 }}
            />
            <button onClick={loadHistory}>Оновити</button>
          </div>

          <div style={{ marginTop: 14 }}>
            {filtered.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Немає записів</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {filtered.map((it) => (
                  <div
                    key={it.savedId}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      display: "grid",
                      gridTemplateColumns: "120px 1fr",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 120,
                        height: 90,
                        borderRadius: 10,
                        background: "#000",
                        overflow: "hidden",
                      }}
                    >
                      {it.imageUrl ? (
                        <img
                          src={`http://localhost:5000${it.imageUrl}`}
                          alt="img"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : null}
                    </div>

                    <div>
                      <div>
                        <b>{it.plantName || "—"}</b> — {it.diseaseName || it.predictedKey || "—"}
                      </div>
                      <div style={{ opacity: 0.85 }}>
                        Ймовірність:{" "}
                        {Number.isFinite(it.confidence) ? `${Math.round(it.confidence * 100)}%` : "—"}
                      </div>

                      <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <select
                          value={it.folderId ?? ""}
                          onChange={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            moveItem(it.savedId, v);
                          }}
                        >
                          <option value="">Без папки</option>
                          {folders.map((f) => (
                            <option key={f.id} value={String(f.id)}>
                              {f.name}
                            </option>
                          ))}
                        </select>

                        <button onClick={() => deleteItem(it.savedId)}>Видалити</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
