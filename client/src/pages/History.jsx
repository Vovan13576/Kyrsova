// client/src/pages/History.jsx
import React, { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { isLoggedIn } from "../services/auth";

const SERVER_ORIGIN = import.meta.env.VITE_SERVER_ORIGIN || "http://localhost:5000";

function toAbsUrl(maybePath) {
  if (!maybePath) return "";
  if (maybePath.startsWith("http://") || maybePath.startsWith("https://")) return maybePath;
  if (maybePath.startsWith("/uploads")) return `${SERVER_ORIGIN}${maybePath}`;
  return maybePath;
}

export default function History() {
  const [folders, setFolders] = useState([]);
  const [items, setItems] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState("all"); // all | none | <id>
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  async function loadAll() {
    setMsg("");

    if (!isLoggedIn()) {
      setFolders([]);
      setItems([]);
      setMsg("Щоб бачити «Мої перевірені», потрібно увійти (401 = неавторизовано).");
      return;
    }

    try {
      const fr = await api.get("/folders");
      setFolders(fr.data?.folders || fr.data || []);
    } catch (e) {
      setFolders([]);
      setMsg(e?.response?.data?.message || "Не вдалося завантажити папки.");
    }

    try {
      const hr = await api.get("/history");
      setItems(hr.data?.items || hr.data || []);
    } catch (e) {
      setItems([]);
      setMsg(e?.response?.data?.message || "Не вдалося завантажити історію.");
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let data = items;

    // folder filter
    if (activeFolderId !== "all") {
      const fid = activeFolderId === "none" ? null : Number(activeFolderId);
      data = data.filter((x) => (fid === null ? x.folderId == null : Number(x.folderId) === fid));
    }

    // search
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      data = data.filter((x) => {
        const t = `${x.predictedKey || ""} ${x.disease?.title || ""} ${x.disease?.description || ""}`.toLowerCase();
        return t.includes(s);
      });
    }

    return data;
  }, [items, activeFolderId, q]);

  async function moveItem(savedId, folderId) {
    setMsg("");
    try {
      await api.put(`/history/${savedId}/move`, {
        folderId: folderId === "none" ? null : Number(folderId),
      });
      await loadAll();
    } catch (e) {
      setMsg(e?.response?.data?.message || "Не вдалося перемістити запис.");
    }
  }

  async function deleteItem(savedId) {
    setMsg("");
    try {
      await api.delete(`/history/${savedId}`);
      await loadAll();
    } catch (e) {
      setMsg(e?.response?.data?.message || "Не вдалося видалити запис.");
    }
  }

  return (
    <div style={{ color: "white" }}>
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12 }}>
        {/* Left: folders */}
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(255,255,255,0.06)" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Папки</div>

          <button
            onClick={() => setActiveFolderId("all")}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 12,
              marginBottom: 8,
              cursor: "pointer",
              fontWeight: activeFolderId === "all" ? 900 : 700,
            }}
          >
            Усі
          </button>

          <button
            onClick={() => setActiveFolderId("none")}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 12,
              marginBottom: 10,
              cursor: "pointer",
              fontWeight: activeFolderId === "none" ? 900 : 700,
            }}
          >
            Без папки
          </button>

          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFolderId(String(f.id))}
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 12,
                marginBottom: 8,
                cursor: "pointer",
                fontWeight: activeFolderId === String(f.id) ? 900 : 700,
              }}
            >
              {f.name}
            </button>
          ))}
        </div>

        {/* Right: list */}
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(255,255,255,0.06)" }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 900 }}>Мої перевірені</div>
            <button onClick={loadAll} style={{ padding: "10px 14px", borderRadius: 12, cursor: "pointer" }}>
              Оновити
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Пошук..."
              style={{ flex: 1, padding: 10, borderRadius: 12 }}
            />
          </div>

          {msg ? (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "rgba(0,0,0,0.18)" }}>
              {msg}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <div style={{ opacity: 0.85 }}>Немає записів</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((it) => {
                const confPct = it.confidence != null ? Math.round(Number(it.confidence) * 100) : 0;
                const imgUrl = it.imageUrl ? toAbsUrl(it.imageUrl) : "";

                return (
                  <div
                    key={it.savedId}
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      background: "rgba(0,0,0,0.18)",
                      display: "grid",
                      gridTemplateColumns: "160px 1fr",
                      gap: 12,
                      alignItems: "start",
                    }}
                  >
                    <div>
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt="leaf"
                          style={{ width: "160px", height: "120px", objectFit: "cover", borderRadius: 14 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "160px",
                            height: "120px",
                            borderRadius: 14,
                            background: "rgba(255,255,255,0.06)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: 0.8,
                          }}
                        >
                          Нема фото
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 16 }}>
                            {it.disease?.title || it.predictedKey || "Невідомо"}
                          </div>
                          <div style={{ opacity: 0.85, marginTop: 4 }}>
                            Ймовірність: <b>{confPct}%</b>
                          </div>
                          <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>
                            {it.savedAt ? `Збережено: ${new Date(it.savedAt).toLocaleString()}` : ""}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => deleteItem(it.savedId)}
                            style={{ padding: "10px 12px", borderRadius: 12, cursor: "pointer" }}
                          >
                            Видалити
                          </button>
                        </div>
                      </div>

                      {it.disease?.description ? (
                        <div style={{ marginTop: 10, opacity: 0.92 }}>
                          <b>Опис:</b> {it.disease.description}
                        </div>
                      ) : null}

                      {it.disease?.tips ? (
                        <div style={{ marginTop: 10, opacity: 0.92 }}>
                          <b>Рекомендації:</b> {it.disease.tips}
                        </div>
                      ) : null}

                      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ opacity: 0.85 }}>Перемістити в папку:</div>
                        <select
                          value={it.folderId == null ? "none" : String(it.folderId)}
                          onChange={(e) => moveItem(it.savedId, e.target.value)}
                          style={{ padding: 10, borderRadius: 12 }}
                        >
                          <option value="none">Без папки</option>
                          {folders.map((f) => (
                            <option key={f.id} value={String(f.id)}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
