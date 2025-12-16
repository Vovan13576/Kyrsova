import React, { useEffect, useMemo, useState } from "react";
import api, { getServerBaseUrl, getErrorMessage } from "../services/api";
import { isAuthed } from "../services/auth";
import { useNavigate } from "react-router-dom";

const cardStyle = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  backdropFilter: "blur(10px)",
};

function toImageUrl(imagePathOrUrl) {
  if (!imagePathOrUrl) return null;
  if (imagePathOrUrl.startsWith("http")) return imagePathOrUrl;

  if (imagePathOrUrl.startsWith("/uploads/")) {
    return `${getServerBaseUrl()}${imagePathOrUrl}`;
  }

  const justName = imagePathOrUrl.replaceAll("\\", "/").split("/").pop();
  return `${getServerBaseUrl()}/uploads/${justName}`;
}

function normalizeItem(x) {
  // на випадок різних форматів
  const predicted = x.predicted_key || x.predictedKey || x.key || "";
  const conf = x.confidence ?? x.score ?? null;
  return {
    id: x.id,
    predicted_key: predicted,
    confidence: conf,
    created_at: x.created_at || x.createdAt || null,
    image_path: x.image_path || x.imagePath || x.imageUrl || null,
    plantName: x.plantName || x.plant_name || "",
    diseaseName: x.diseaseName || x.disease_name || "",
    verified: !!x.verified,
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
        <div style={{ ...cardStyle, marginBottom: 14, padding: 12, borderColor: "rgba(255,120,120,0.22)", background: "rgba(255,120,120,0.10)" }}>
          {banner}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16 }}>
        {/* left: folders */}
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Папки</div>

          <button
            onClick={() => onSelectMode("all")}
            style={{
              width: "100%",
              padding: "12px 12px",         // ✅ більша
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.12)",
              background: activeFolder === "all" ? "rgba(70,120,255,0.18)" : "rgba(255,255,255,0.06)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            Усі / Без папки
          </button>

          <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto", paddingRight: 4 }}>
            {folders.map((f) => (
              <div
                key={f.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 44px 44px",
                  gap: 10,
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: activeFolder === `folder:${f.id}` ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
                }}
              >
                <button
                  onClick={() => onSelectMode(`folder:${f.id}`)}
                  style={{
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  {f.name}
                </button>

                <button
                  onClick={() => renameFolder(f)}
                  style={{
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                  title="Перейменувати"
                >
                  ✏️
                </button>

                <button
                  onClick={() => deleteFolder(f)}
                  style={{
                    height: 40,
                    borderRadius: 12,
                    border: "1px solid rgba(255,90,90,0.30)",
                    background: "rgba(255,90,90,0.10)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                  title="Видалити"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 110px", gap: 10 }}>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Нова папка..."
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                outline: "none",
              }}
            />
            <button
              onClick={createFolder}
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              ➕ Додати
            </button>
          </div>
        </div>

        {/* right: list */}
        <div style={{ ...cardStyle }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Мої перевірені</div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук..."
              style={{
                marginLeft: "auto",
                minWidth: 260,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                outline: "none",
              }}
            />

            <button
              onClick={() => loadItems(activeFolder)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              🔄 Оновити
            </button>
          </div>

          {loading ? (
            <div style={{ opacity: 0.8 }}>Завантаження...</div>
          ) : filtered.length === 0 ? (
            <div style={{ opacity: 0.8 }}>Немає записів</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {filtered.map((x) => {
                const img = toImageUrl(x.image_path);
                const conf =
                  x.confidence === null || x.confidence === undefined
                    ? null
                    : Math.round(Number(x.confidence) * (Number(x.confidence) > 1 ? 1 : 100));

                return (
                  <div
                    key={x.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "110px 1fr 90px",
                      gap: 12,
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.05)",
                    }}
                  >
                    <div
                      style={{
                        width: 110,
                        height: 78,
                        borderRadius: 14,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(0,0,0,0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {img ? (
                        <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ opacity: 0.7, fontSize: 12 }}>no image</div>
                      )}
                    </div>

                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 2 }}>
                        {x.plantName || "Рослина"} <span style={{ opacity: 0.65 }}>—</span>{" "}
                        {x.diseaseName || "Хвороба"}
                      </div>
                      <div style={{ opacity: 0.8, fontSize: 13 }}>
                        {x.predicted_key || "—"}
                      </div>
                      <div style={{ opacity: 0.75, fontSize: 13, marginTop: 6 }}>
                        ID: {x.id}
                        {x.verified ? <span style={{ marginLeft: 10 }}>✅ verified</span> : null}
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div
                        style={{
                          width: 66,
                          height: 66,
                          borderRadius: 999,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "rgba(255,255,255,0.06)",
                        }}
                      >
                        {conf !== null ? `${conf}%` : "—"}
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
