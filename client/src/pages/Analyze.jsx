import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api.js";
import { isAuthed } from "../services/auth.js";

export default function Analyze() {
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [banner, setBanner] = useState("");

  // camera
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const canSave = useMemo(() => Boolean(result?.analysisId), [result]);

  useEffect(() => {
    // cleanup preview
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // ✅ якщо сторінка закрилась/перемкнувся роут — камера точно вимкнеться
  useEffect(() => {
    return () => {
      stopCamera(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadFolders() {
    try {
      if (!isAuthed()) {
        setFolders([]);
        return;
      }
      const r = await api.get("/folders");
      setFolders(r.items || r.folders || []);
    } catch {
      setFolders([]);
    }
  }

  useEffect(() => {
    loadFolders();
  }, []);

  async function startCamera() {
    setCameraError("");
    setBanner("");

    try {
      console.log("[CAMERA] start requested");

      // якщо вже була камера — прибираємо попередній стрім
      stopCamera(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;

        // ✅ інколи потрібно дочекатись metadata
        await new Promise((resolve) => {
          const done = () => resolve();
          if (video.readyState >= 2) return done();
          video.onloadedmetadata = done;
        });

        await video.play();
      }

      setCameraOn(true);
      console.log("[CAMERA] started");
    } catch (e) {
      console.error("[CAMERA] start error:", e);
      setCameraError(
        "Не вдалося увімкнути камеру. Перевір дозвіл у браузері (камера) і чи вона не зайнята іншим додатком."
      );
      setCameraOn(false);
    }
  }

  // ✅ force=true — для cleanup на unmount/перезапуск
  function stopCamera(force = false) {
    try {
      const video = videoRef.current;
      if (video) {
        try {
          video.pause();
        } catch {}
        // ✅ ключове: прибрати srcObject, інакше може “висіти” чорний екран
        video.srcObject = null;
      }

      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
      }

      console.log("[CAMERA] stopped");
    } finally {
      streamRef.current = null;
      if (!force) setCameraOn(false);
      else setCameraOn(false);
    }
  }

  function onPickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;

    setResult(null);
    setBanner("");

    // якщо вибрали файл — камера точно вимикається
    stopCamera(true);

    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  async function takePhoto() {
    setBanner("");
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return;

    const f = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });

    setFile(f);
    setResult(null);

    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  async function runAnalyze() {
    if (!file) {
      setBanner("Спочатку вибери файл або зроби фото з камери.");
      return;
    }

    setLoading(true);
    setResult(null);
    setBanner("");

    try {
      const fd = new FormData();
      fd.append("image", file);

      // ✅ викликає /api/analyze (server.js тепер правильно підключив)
      const r = await api.postForm("/analyze", fd);

      if (r?.plant_detected === false) {
        setBanner(r.message || "Листок не знайдено.");
        setResult(null);
        return;
      }

      setResult(r);
    } catch (e) {
      setBanner(e?.message || "Помилка аналізу");
    } finally {
      setLoading(false);
    }
  }

  async function saveToHistory() {
    if (!canSave) return;
    if (!isAuthed()) {
      setBanner("Щоб зберігати в «Мої перевірені», потрібно увійти.");
      return;
    }

    setSaving(true);
    setBanner("");
    try {
      await api.post("/history/save", {
        analysisId: result.analysisId,
        folderId: folderId === "" ? null : Number(folderId),
      });
      setBanner("✅ Збережено в «Мої перевірені»");
    } catch (e) {
      setBanner(e?.message || "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  }

  function clearAll() {
    setFile(null);
    setPreviewUrl("");
    setResult(null);
    setBanner("");
  }

  return (
    <div style={{ padding: 24 }}>
      {banner ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: banner.toLowerCase().includes("неавтор") ? "#3b1d1d" : "#1f2a36",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {banner}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <input type="file" accept="image/*" onChange={onPickFile} />

        {!cameraOn ? (
          <button onClick={startCamera}>Увімкнути камеру</button>
        ) : (
          <>
            <button onClick={() => stopCamera(false)}>Вимкнути камеру</button>
            <button onClick={takePhoto}>Зробити фото (листок по центру)</button>
          </>
        )}

        <button onClick={runAnalyze} disabled={loading}>
          {loading ? "Аналіз..." : "Запустити аналіз"}
        </button>

        <button onClick={clearAll}>Очистити</button>
      </div>

      {isAuthed() ? (
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ marginBottom: 6 }}>Папка:</div>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">Без папки</option>
              {folders.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <button onClick={saveToHistory} disabled={!canSave || saving}>
            {saving ? "Збереження..." : "⭐ Зберегти в «Мої перевірені»"}
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 12, opacity: 0.85 }}>
          Щоб бачити папки і «Мої перевірені» — увійди (інакше буде 401).
        </div>
      )}

      {cameraError ? <div style={{ marginTop: 12, color: "#ffb3b3" }}>{cameraError}</div> : null}

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ marginBottom: 10, fontWeight: 700 }}>Попередній перегляд</div>

          {cameraOn ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", borderRadius: 12, background: "#000", minHeight: 280 }}
            />
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="preview"
              style={{ width: "100%", borderRadius: 12, objectFit: "contain", background: "#000" }}
            />
          ) : (
            <div style={{ opacity: 0.7 }}>Немає зображення</div>
          )}
        </div>

        <div style={{ padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ marginBottom: 10, fontWeight: 700 }}>Результат</div>

          {!result ? (
            <div style={{ opacity: 0.7 }}>Після аналізу тут буде відповідь сервера</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <b>Рослина:</b> {result.plantName || "—"}
              </div>
              <div>
                <b>Стан / Хвороба:</b> {result.diseaseName || "—"}
              </div>
              <div>
                <b>Ймовірність:</b>{" "}
                {Number.isFinite(result.confidence) ? `${Math.round(result.confidence * 100)}%` : "—"}
              </div>

              {result?.disease?.description ? (
                <div style={{ marginTop: 6 }}>
                  <b>Опис:</b>
                  <div style={{ opacity: 0.9 }}>{result.disease.description}</div>
                </div>
              ) : null}

              {result?.disease?.tips ? (
                <div style={{ marginTop: 6 }}>
                  <b>Рекомендації:</b>
                  <div style={{ opacity: 0.9 }}>{result.disease.tips}</div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
