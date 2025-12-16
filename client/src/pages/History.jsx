import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getErrorMessage, getServerBaseUrl } from "../services/api.js";
import { isAuthed } from "../services/auth.js";

const cardStyle = {
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.06)",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};

function splitPredictedKey(predictedKey) {
  if (!predictedKey || typeof predictedKey !== "string") {
    return { plantName: "Unknown", diseaseName: "Unknown" };
  }
  const parts = predictedKey.split("___");
  const plantRaw = (parts[0] || "").trim();
  const diseaseRaw = (parts.slice(1).join("___") || "").trim();

  const plantName = (plantRaw || "Unknown").replaceAll("_", " ").trim();
  const diseaseName = (diseaseRaw || "Unknown").replaceAll("_", " ").trim();
  return { plantName, diseaseName };
}

function toImageUrl(imagePath) {
  if (!imagePath) return "";

  // already URL
  if (typeof imagePath === "string" && (imagePath.startsWith("http://") || imagePath.startsWith("https://"))) {
    return imagePath;
  }

  const base = getServerBaseUrl();

  // stored as "/uploads/xxx"
  if (imagePath.startsWith("/uploads/")) return `${base}${imagePath}`;

  // stored as "C:\...\uploads\xxx" -> take filename
  const normalized = imagePath.replaceAll("\\", "/");
  const idx = normalized.lastIndexOf("/uploads/");
  if (idx !== -1) {
    const tail = normalized.slice(idx);
    return `${base}${tail}`;
  }

  // fallback: try attach
  return `${base}${imagePath.startsWith("/") ? "" : "/"}${imagePath}`;
}

function formatPercent(conf) {
  if (conf === null || conf === undefined || Number.isNaN(Number(conf))) return "—";
  const p = Math.round(Number(conf) * 100);
  return `${Math.max(0, Math.min(100, p))}%`;
}

function normalizeItem(x) {
  const predicted_key = x.predicted_key ?? x.predictedKey ?? x.key ?? "";
  const { plantName, diseaseName } = splitPredictedKey(predicted_key);

  const confidence =
    x.confidence === null || x.confidence === undefined
      ? null
      : Number(x.confidence);

  return {
    id: x.id,
    predicted_key,
    plantName: x.plantName || plantName,
    diseaseName: x.diseaseName || diseaseName,
    confidence,
    image_path: x.image_path || x.imagePath || "",
    verified: !!x.verified,
    created_at: x.created_at || x.createdAt || null,

    // optional disease info from backend
    disease_title: x.disease_title || x.diseaseTitle || "",
    disease_description: x.disease_description || x.diseaseDescription || "",
    disease_tips: x.disease_tips || x.diseaseTips || "",
  };
}

export default function History() {
  const navigate = useNavigate();

  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState("all"); // all | unassigned | folder:<id>
  const [items, setItems] = useState([]);

  const [search, setSearch] = useState("");
  const [newFolderName, setNewFolderName] = useState("");

  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("");

  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!isAuthed()) {
      navigate("/login");
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    await Promise.all([loadFolders(), loadItems("all")]);
  }

  async function loadFolders() {
    try {
      const data = await api.get("/folders");
      const list = data?.items || data?.folders || data || [];
      setFolders(Array.isArray(list) ? list : []);
    } catch (e) {
      setBanner(getErrorMessage(e));
    }
  }

  async function loadItems(mode) {
    try {
      setBanner("");
      setLoading(true);

      let data;
      if (mode === "all") data = await api.get("/history");
      else if (mode === "unassigned") data = await api.get("/history/unassigned");
      else if (mode.startsWith("folder:")) {
        const id = mode.split(":")[1];
        data = await api.get(`/history/folder/${id}`);
      }

      const list = data?.items || data?.results || data || [];
      setItems(Array.isArray(list) ? list.map(normalizeItem) : []);
    } catch (e) {
      setBanner(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function onSelectMode(mode) {
    setActiveFolder(mode);
    setExpandedId(null);
    await loadItems(mode);
  }

  async function createFolder() {
    const name = (newFolderName || "").trim();
    if (!name) return;

    try {
      setBanner("");
      const data = await api.post("/folders", { name });
      if (data?.ok === false) {
        setBanner(data?.message || "Не вдалося створити папку");
        return;
      }
      setNewFolderName("");
      await loadFolders();
    } catch (e) {
      setBanner(getErrorMessage(e));
    }
  }

  async function renameFolder(folder) {
    const next = prompt("Нова назва папки:", folder.name);
    if (next === null) return;
    const name = next.trim();
    if (!name) return;

    try {
      setBanner("");
      await api.put(`/folders/${folder.id}`, { name });
      await loadFolders();
    } catch (e) {
      setBanner(getErrorMessage(e));
    }
  }

  async function deleteFolder(folder) {
    if (!confirm(`Видалити папку "${folder.name}"?`)) return;

    try {
      setBanner("");
      await api.del(`/folders/${folder.id}`);
      if (activeFolder === `folder:${folder.id}`) {
        await onSelectMode("all");
      } else {
        await loadItems(activeFolder);
      }
      await loadFolders();
    } catch (e) {
      setBanner(getErrorMessage(e));
    }
  }

  // ✅ НОВЕ: видалити аналіз
  async function deleteAnalysis(item) {
    if (!confirm(`Видалити аналіз ID: ${item.id}?`)) return;

    try {
      setBanner("");
      await api.del(`/history/${item.id}`);
      setExpandedId(null);
      await loadItems(activeFolder);
    } catch (e) {
      setBanner(getErrorMessage(e));
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((x) => {
      const a = `${x.plantName} ${x.diseaseName} ${x.predicted_key}`.toLowerCase();
      return a.includes(q);
    });
  }, [items, search]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 16px" }}>
      {banner ? (
        <div
          style={{
            ...cardStyle,
            marginBottom: 14,
            padding: 12,
            borderColor: "rgba(255,120,120,0.22)",
            background: "rgba(255,120,120,0.10)",
          }}
        >
          {banner}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
        {/* left: folders */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Папки</div>

          {/* ✅ зроблено трохи більшим */}
          <button
            onClick={() => onSelectMode("all")}
            style={{
              width: "100%",
              padding: "14px 14px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: activeFolder === "all" ? "rgba(70,120,255,0.18)" : "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 900,
              marginBottom: 10,
            }}
          >
            Усі / Без папки
          </button>

          <button
            onClick={() => onSelectMode("unassigned")}
            style={{
              width: "100%",
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: activeFolder === "unassigned" ? "rgba(70,120,255,0.18)" : "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            Без папки (не розкладені)
          </button>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
            {(folders || []).map((f) => (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 40px 40px", gap: 8, marginBottom: 10 }}>
                <button
                  onClick={() => onSelectMode(`folder:${f.id}`)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: activeFolder === `folder:${f.id}` ? "rgba(70,120,255,0.18)" : "rgba(255,255,255,0.05)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 800,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={f.name}
                >
                  {f.name}
                </button>

                <button
                  onClick={() => renameFolder(f)}
                  title="Перейменувати"
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  ✎
                </button>

                <button
                  onClick={() => deleteFolder(f)}
                  title="Видалити папку"
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(255,120,120,0.25)",
                    background: "rgba(255,120,120,0.10)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Нова папка..."
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.20)",
                color: "#fff",
                outline: "none",
              }}
            />
            <button
              onClick={createFolder}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.07)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              ➕ Додати
            </button>
          </div>
        </div>

        {/* right: items */}
        <div style={{ ...cardStyle }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Мої перевірені</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Пошук..."
                style={{
                  width: 260,
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.18)",
                  color: "#fff",
                  outline: "none",
                }}
              />
              <button
                onClick={() => loadItems(activeFolder)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.07)",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                🔄 Оновити
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ opacity: 0.85 }}>Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div style={{ opacity: 0.8 }}>Поки що немає аналізів.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {filtered.map((x) => {
                const img = toImageUrl(x.image_path);
                const percent = formatPercent(x.confidence);
                const isExpanded = expandedId === x.id;

                return (
                  <div
                    key={x.id}
                    style={{
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.05)",
                      padding: 12,
                      display: "grid",
                      gridTemplateColumns: "92px 1fr 90px",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 92,
                        height: 72,
                        borderRadius: 14,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(0,0,0,0.25)",
                      }}
                    >
                      {img ? (
                        <img
                          src={img}
                          alt="analysis"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                    </div>

                    <div style={{ display: "grid", gap: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>
                        Рослина — Хвороба
                      </div>
                      <div style={{ opacity: 0.9 }}>
                        {x.plantName} — {x.diseaseName}
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                        <div style={{ opacity: 0.75, fontSize: 13 }}>ID: {x.id}</div>

                        {x.verified ? (
                          <div
                            style={{
                              display: "inline-flex",
                              gap: 6,
                              alignItems: "center",
                              padding: "3px 8px",
                              borderRadius: 999,
                              border: "1px solid rgba(120,255,180,0.22)",
                              background: "rgba(120,255,180,0.10)",
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            ✅ verified
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "inline-flex",
                              gap: 6,
                              alignItems: "center",
                              padding: "3px 8px",
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(255,255,255,0.06)",
                              fontSize: 12,
                              fontWeight: 800,
                              opacity: 0.9,
                            }}
                          >
                            ⏳ not verified
                          </div>
                        )}

                        <button
                          onClick={() => setExpandedId(isExpanded ? null : x.id)}
                          style={{
                            marginLeft: "auto",
                            padding: "6px 10px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(255,255,255,0.06)",
                            color: "#fff",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                        >
                          {isExpanded ? "▾ Сховати" : "▸ Деталі"}
                        </button>

                        <button
                          onClick={() => deleteAnalysis(x)}
                          title="Видалити аналіз"
                          style={{
                            padding: "6px 10px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,120,120,0.25)",
                            background: "rgba(255,120,120,0.10)",
                            color: "#fff",
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                        >
                          🗑 Видалити
                        </button>
                      </div>

                      {isExpanded ? (
                        <div
                          style={{
                            marginTop: 10,
                            padding: 10,
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(0,0,0,0.18)",
                          }}
                        >
                          <div style={{ fontWeight: 900, marginBottom: 6 }}>Опис</div>
                          <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>
                            {x.disease_description || "Немає опису для цієї хвороби (в БД таблиці diseases)."}
                          </div>

                          <div style={{ fontWeight: 900, marginTop: 10, marginBottom: 6 }}>Рекомендації</div>
                          <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>
                            {x.disease_tips || "Немає рекомендацій (в БД таблиці diseases)."}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: "50%",
                          border: "2px solid rgba(255,255,255,0.16)",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 900,
                        }}
                      >
                        {percent}
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
