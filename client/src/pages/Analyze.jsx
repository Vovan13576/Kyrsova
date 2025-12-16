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
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopCamera();
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
      const items = r?.items || r?.folders || r || [];
      setFolders(Array.isArray(items) ? items : []);
    } catch {
      setFolders([]);
    }
  }

  useEffect(() => {
    loadFolders();
  }, []);

  async function startCamera() {
    setCameraError("");
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraError("Браузер не підтримує доступ до камери (mediaDevices.getUserMedia).");
        return;
      }

      // якщо вже є стрім — спочатку зупинимо
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      streamRef.current = stream;

      // ✅ ВАЖЛИВО: videoRef має існувати. Тепер <video> рендериться завжди.
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;

        await new Promise((resolve) => {
          video.onloadedmetadata = () => resolve();
        });

        await video.play();
        setCameraOn(true);
      } else {
        setCameraError("Video елемент не знайдено (videoRef null).");
        setCameraOn(false);
      }
    } catch (e) {
      console.error("startCamera error:", e);
      setCameraError(
        `Не вдалося увімкнути камеру: ${e?.name || ""} ${e?.message || ""}. ` +
          "Перевір дозвіл у браузері (камера) і чи вона не зайнята іншим додатком."
      );
      setCameraOn(false);
    }
  }

  function stopCamera() {
    try {
      const s = streamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    } finally {
      streamRef.current = null;
      setCameraOn(false);
    }
  }

  function onPickFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setResult(null);
    setBanner("");
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  async function takePhoto() {
    setBanner("");
    const video = videoRef.current;
    if (!video || !cameraOn) return;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);

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
            <button onClick={stopCamera}>Вимкнути камеру</button>
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

          {/* ✅ video рендериться ЗАВЖДИ, щоб videoRef існував */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              borderRadius: 12,
              background: "#000",
              minHeight: 280,
              display: cameraOn ? "block" : "none",
            }}
          />

          {!cameraOn ? (
            previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                style={{ width: "100%", borderRadius: 12, objectFit: "contain", background: "#000" }}
              />
            ) : (
              <div style={{ opacity: 0.7 }}>Немає зображення</div>
            )
          ) : null}
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
