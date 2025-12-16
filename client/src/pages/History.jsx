import React, { useEffect, useMemo, useState } from "react";
import api, { getErrorMessage } from "../services/api.js";
import { isAuthed } from "../services/auth.js";

export default function History() {
  const [folders, setFolders] = useState([]);
  const [selected, setSelected] = useState("all"); // all | unassigned | folder:<id>
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");

  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  const [banner, setBanner] = useState("");

  // folder modal
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  const selectedFolderId = useMemo(() => {
    if (selected.startsWith("folder:")) return Number(selected.split(":")[1]);
    return null;
  }, [selected]);

  const filteredItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((x) => {
      const key = String(x.predicted_key || x.predictedKey || "").toLowerCase();
      const title = String(x.title || x.disease_title || "").toLowerCase();
      const plant = String(x.plantName || "").toLowerCase();
      const disease = String(x.diseaseName || "").toLowerCase();
      return key.includes(s) || title.includes(s) || plant.includes(s) || disease.includes(s);
    });
  }, [items, q]);

  async function loadFolders() {
    setLoadingFolders(true);
    setBanner("");
    try {
      const r = await api.get("/folders");
      const list = r?.items || r?.folders || r || [];
      setFolders(Array.isArray(list) ? list : []);
    } catch (e) {
      setFolders([]);
      setBanner(getErrorMessage(e));
    } finally {
      setLoadingFolders(false);
    }
  }

  async function loadItems() {
    setLoadingItems(true);
    setBanner("");
    try {
      let r;
      if (selected === "all") r = await api.get("/history");
      else if (selected === "unassigned") r = await api.get("/history/unassigned");
      else if (selectedFolderId) r = await api.get(`/history/folder/${selectedFolderId}`);
      else r = await api.get("/history");

      const list = r?.items || r?.results || r || [];
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setItems([]);
      setBanner(getErrorMessage(e));
    } finally {
      setLoadingItems(false);
    }
  }

  useEffect(() => {
    if (!isAuthed()) {
      setBanner("Щоб бачити «Мої перевірені», потрібно увійти (401 = неавторизовано).");
      return;
    }
    loadFolders();
  }, []);

  useEffect(() => {
    if (!isAuthed()) return;
    loadItems();
  }, [selected]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;

    setCreating(true);
    setBanner("");
    try {
      await api.post("/folders", { name });
      setNewFolderName("");
      await loadFolders();
    } catch (e) {
      setBanner(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function renameFolder(id, oldName) {
    const name = prompt("Нова назва папки:", oldName || "");
    if (!name || !name.trim()) return;

    setBanner("");
    try {
      await api.put(`/folders/${id}`, { name: name.trim() });
      await loadFolders();
    } catch (e) {
      setBanner(getErrorMessage(e));
    }
  }

  async function deleteFolder(id, name) {
    const ok = confirm(`Видалити папку "${name}"?\n(Записи можуть перейти в "Без папки")`);
    if (!ok) return;

    setBanner("");
    try {
      await api.del(`/folders/${id}`);
      if (selected === `folder:${id}`) setSelected("all");
      await loadFolders();
      await loadItems();
    } catch (e) {
      setBanner(getErrorMessage(e));
    }
  }

  function renderItem(x) {
    const id = x.id ?? x.analysis_id ?? x.analysisId ?? Math.random();
    const predictedKey = x.predicted_key || x.predictedKey || "";
    const confidence = Number(x.confidence);
    const imagePath = x.image_path || x.imagePath || x.imageUrl || "";
    const createdAt = x.created_at || x.createdAt || "";

    const imgUrl =
      imagePath && imagePath.startsWith("http")
        ? imagePath
        : imagePath
        ? `http://localhost:5000/uploads/${imagePath}` // у тебе сервер віддає /uploads
        : "";

    return (
      <div
        key={String(id)}
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 12,
          display: "grid",
          gridTemplateColumns: "120px 1fr",
          gap: 12,
          alignItems: "center",
          background: "rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            width: 120,
            height: 90,
            borderRadius: 12,
            overflow: "hidden",
            background: "#000",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          {imgUrl ? (
            <img
              src={imgUrl}
              alt="img"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ color: "#aaa", fontSize: 12, padding: 8 }}>Нема фото</div>
          )}
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800 }}>{predictedKey || "—"}</div>
          <div style={{ opacity: 0.9 }}>
            Ймовірність:{" "}
            {Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "—"}
          </div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            {createdAt ? `Дата: ${createdAt}` : ""}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {banner ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: banner.toLowerCase().includes("401") ? "#3b1d1d" : "#1f2a36",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {banner}
        </div>
      ) : null}

      {!isAuthed() ? (
        <div style={{ opacity: 0.9 }}>
          Спочатку увійди, тоді відкривай «Перевірені».
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          {/* LEFT: folders */}
          <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>Папки</div>
              <button onClick={loadFolders} disabled={loadingFolders}>
                {loadingFolders ? "..." : "Оновити"}
              </button>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <button
                onClick={() => setSelected("all")}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: selected === "all" ? "rgba(255,255,255,0.10)" : "transparent",
                  color: "white",
                }}
              >
                Усі
              </button>

              <button
                onClick={() => setSelected("unassigned")}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: selected === "unassigned" ? "rgba(255,255,255,0.10)" : "transparent",
                  color: "white",
                }}
              >
                Без папки
              </button>

              {folders.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 6,
                    alignItems: "center",
                    padding: "6px 6px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: selected === `folder:${f.id}` ? "rgba(255,255,255,0.08)" : "transparent",
                  }}
                >
                  <button
                    onClick={() => setSelected(`folder:${f.id}`)}
                    style={{
                      textAlign: "left",
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "none",
                      background: "transparent",
                      color: "white",
                      cursor: "pointer",
                    }}
                    title={f.name}
                  >
                    {f.name}
                  </button>

                  <button onClick={() => renameFolder(f.id, f.name)} title="Перейменувати">
                    ✏️
                  </button>
                  <button onClick={() => deleteFolder(f.id, f.name)} title="Видалити">
                    🗑️
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Додати папку</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Назва папки..."
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(0,0,0,0.25)",
                    color: "white",
                  }}
                />
                <button onClick={createFolder} disabled={creating}>
                  {creating ? "..." : "Додати"}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: list */}
          <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800 }}>Мої перевірені</div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Пошук..."
                style={{
                  flex: 1,
                  minWidth: 240,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(0,0,0,0.25)",
                  color: "white",
                }}
              />

              <button onClick={loadItems} disabled={loadingItems}>
                {loadingItems ? "..." : "Оновити"}
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {loadingItems ? (
                <div style={{ opacity: 0.8 }}>Завантаження...</div>
              ) : filteredItems.length === 0 ? (
                <div style={{ opacity: 0.8 }}>Немає записів</div>
              ) : (
                filteredItems.map(renderItem)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
