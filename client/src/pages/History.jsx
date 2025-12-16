// client/src/pages/History.jsx
import React, { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, getErrorMessage } from "../services/api.js";
import { isAuthed } from "../services/auth.js";

export default function History() {
  const authed = useMemo(() => isAuthed(), []);

  const [folders, setFolders] = useState([]);
  const [activeFolderId, setActiveFolderId] = useState("unassigned");
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");

  const [newFolderName, setNewFolderName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadFolders() {
    const data = await apiGet("/folders");
    const list = data?.items || data?.folders || data || [];
    setFolders(Array.isArray(list) ? list : []);
  }

  async function loadItems(folderId) {
    if (folderId === "unassigned") {
      const data = await apiGet("/history/unassigned");
      setItems(data?.items || data || []);
      return;
    }
    const data = await apiGet(`/history/folder/${folderId}`);
    setItems(data?.items || data || []);
  }

  async function refresh() {
    setError("");
    if (!authed) {
      setError("Щоб бачити «Перевірені» — увійди.");
      return;
    }
    setBusy(true);
    try {
      await loadFolders();
      await loadItems(activeFolderId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolderId]);

  async function addFolder() {
    setError("");
    if (!newFolderName.trim()) return;

    setBusy(true);
    try {
      await apiPost("/folders", { name: newFolderName.trim() });
      setNewFolderName("");
      await loadFolders();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function renameFolder(id) {
    setError("");
    const name = prompt("Нова назва папки:");
    if (!name) return;

    setBusy(true);
    try {
      await apiPut(`/folders/${id}`, { name });
      await loadFolders();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteFolder(id) {
    setError("");
    if (!confirm("Видалити папку?")) return;

    setBusy(true);
    try {
      await apiDelete(`/folders/${id}`);
      if (String(activeFolderId) === String(id)) setActiveFolderId("unassigned");
      await loadFolders();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const filtered = items.filter((x) => {
    if (!q.trim()) return true;
    const t = `${x.plant_name || ""} ${x.predicted_key || ""} ${x.disease_name || ""}`.toLowerCase();
    return t.includes(q.trim().toLowerCase());
  });

  return (
    <div className="page">
      <div className="gridHistory">
        <div className="card">
          <div className="cardTitle">Папки</div>

          <div className="folderList">
            <button
              className={`folderBtn ${activeFolderId === "unassigned" ? "active" : ""}`}
              onClick={() => setActiveFolderId("unassigned")}
            >
              Усі / Без папки
            </button>

            {folders.map((f) => (
              <div className="folderRow" key={f.id}>
                <button
                  className={`folderBtn ${String(activeFolderId) === String(f.id) ? "active" : ""}`}
                  onClick={() => setActiveFolderId(f.id)}
                >
                  {f.name}
                </button>

                <button className="iconBtn" onClick={() => renameFolder(f.id)} title="Перейменувати">✏️</button>
                <button className="iconBtn danger" onClick={() => deleteFolder(f.id)} title="Видалити">🗑️</button>
              </div>
            ))}
          </div>

          <div className="divider" />

          <div className="row">
            <input
              className="input"
              placeholder="Нова папка..."
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <button className="btn soft" onClick={addFolder} disabled={busy}>
              ➕ Додати
            </button>
          </div>
        </div>

        <div className="card">
          <div className="historyTop">
            <div className="cardTitle">Мої перевірені</div>

            <div className="row">
              <input className="input" placeholder="Пошук..." value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn ghost" onClick={refresh} disabled={busy}>
                🔄 Оновити
              </button>
            </div>
          </div>

          {error ? <div className="errorBox">{error}</div> : null}

          {filtered.length === 0 ? (
            <div className="muted">Немає записів</div>
          ) : (
            <div className="historyList">
              {filtered.map((x) => (
                <div className="historyItem" key={x.id}>
                  <div className="historyMain">
                    <div><b>{x.plant_name || x.plantName || "Рослина"}</b></div>
                    <div className="mutedSmall">
                      {x.disease_name || x.diseaseName || x.predicted_key || x.predictedKey || "—"}
                    </div>
                  </div>
                  <div className="historySide">
                    <div className="pill">
                      {typeof x.confidence === "number"
                        ? `${Math.round(x.confidence * 100)}%`
                        : (x.confidence ?? "—")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
