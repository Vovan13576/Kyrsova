// client/src/pages/Analyze.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, getErrorMessage } from "../services/api.js";
import { isAuthed } from "../services/auth.js";

export default function Analyze() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const previewUrlRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);

  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState("");

  const authed = useMemo(() => isAuthed(), []);

  // ------- folders (for save) -------
  useEffect(() => {
    let ignore = false;

    async function load() {
      if (!authed) return;
      try {
        const data = await apiGet("/folders");
        const items = data?.items || data?.folders || data || [];
        if (!ignore) setFolders(Array.isArray(items) ? items : []);
      } catch {
        // тихо, щоб не заважало аналізу
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [authed]);

  // ------- preview cleanup -------
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  // ------- attach stream to video -------
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;

    if (!cameraOn || !video || !stream) return;

    try {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;

      const onMeta = async () => {
        try {
          await video.play();
        } catch {
          // інколи браузер не дає play() одразу — але після жесту кнопкою буде ок
        }
      };

      video.addEventListener("loadedmetadata", onMeta);
      return () => video.removeEventListener("loadedmetadata", onMeta);
    } catch {
      // ignore
    }
  }, [cameraOn]);

  async function startCamera() {
    setMsg("");
    setResult(null);

    // якщо був файл — прибираємо
    setFile(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl("");

    // стоп старого стріму
    stopCamera();

    console.log("[CAMERA] start requested");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOn(true);

      // інколи треба “підштовхнути” play() саме тут після жесту
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {}
      }

      console.log("[CAMERA] started");
    } catch (err) {
      console.log("[CAMERA] error", err);
      setCameraOn(false);
      streamRef.current = null;
      setMsg("Не вдалося відкрити камеру (перевір дозволи браузера).");
    }
  }

  function stopCamera() {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;

    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {}
      video.srcObject = null;
    }

    if (cameraOn) console.log("[CAMERA] stopped");
    setCameraOn(false);
  }

  function onPickFile(e) {
    setMsg("");
    setResult(null);

    stopCamera();

    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    const url = URL.createObjectURL(f);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }

  async function takePhoto() {
    setMsg("");
    setResult(null);

    const video = videoRef.current;
    if (!video || !streamRef.current) {
      setMsg("Камера не запущена.");
      return;
    }

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setMsg("Не вдалося зробити фото.");
      return;
    }

    const shot = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
    setFile(shot);

    const url = URL.createObjectURL(shot);
    previewUrlRef.current = url;
    setPreviewUrl(url);

    // можна залишити камеру увімкненою, але UI тоді часто плутає людей.
    // Вимикаємо — щоб було стабільно.
    stopCamera();
  }

  async function runAnalyze() {
    setMsg("");
    setResult(null);

    if (!file) {
      setMsg("Спочатку вибери файл або зроби фото.");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("image", file);

      const data = await apiPost("/analyze", fd);

      // очікуємо щось типу:
      // { ok:true, analysisId, plantName, diseaseName, predictedKey, confidence, isHealthy, ... }
      setResult(data);

      if (data?.ok === false) {
        setMsg(data?.message || "Аналіз не вдався.");
      } else {
        setMsg("");
      }
    } catch (err) {
      setMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveToFolder() {
    setMsg("");

    if (!authed) {
      setMsg("Щоб зберігати — увійди.");
      return;
    }
    if (!result?.analysisId) {
      setMsg("Немає analysisId від сервера. Після аналізу сервер має повернути analysisId.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        analysisId: result.analysisId,
        folderId: folderId ? Number(folderId) : null,
      };

      await apiPost("/history/save", payload);
      setMsg("✅ Збережено в «Мої перевірені».");
    } catch (err) {
      setMsg(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {
    setMsg("");
    setResult(null);

    stopCamera();

    setFile(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl("");
  }

  return (
    <div className="page">
      <div className="card hero">
        <div className="heroTop">
          <div>
            <h1 className="heroTitle">Plant Disease Detection</h1>
            <div className="heroSub">
              Завантаж фото або увімкни камеру, зроби кадр і запускай аналіз.
            </div>
          </div>

          <div className="heroActions">
            <label className="btn soft">
              📁 Вибрати файл
              <input type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
            </label>

            {!cameraOn ? (
              <button className="btn soft" onClick={startCamera}>
                📷 Увімкнути камеру
              </button>
            ) : (
              <button className="btn danger" onClick={stopCamera}>
                ✖ Вимкнути камеру
              </button>
            )}

            <button className="btn soft" onClick={takePhoto} disabled={!cameraOn}>
              🎯 Зробити фото
            </button>

            <button className="btn primary" onClick={runAnalyze} disabled={busy}>
              ⚡ Запустити аналіз
            </button>

            <button className="btn ghost" onClick={clearAll} disabled={busy}>
              🧹 Очистити
            </button>
          </div>
        </div>

        <div className="hint">
          {authed ? "✅ Ти увійшов — можна зберігати в папки." : "Щоб зберігати в «Мої перевірені» і бачити папки — увійди."}
        </div>

        {msg ? <div className="status">{msg}</div> : null}
      </div>

      <div className="grid2">
        <div className="card">
          <div className="cardTitle">Попередній перегляд</div>

          <div className="mediaBox">
            {cameraOn ? (
              <video ref={videoRef} className="video" autoPlay playsInline muted />
            ) : previewUrl ? (
              <img className="img" src={previewUrl} alt="preview" />
            ) : (
              <div className="empty">Немає зображення.<br />Завантаж фото або увімкни камеру.</div>
            )}
          </div>

          <div className="row">
            <div className="label">Папка:</div>
            <select
              className="select"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              disabled={!authed || folders.length === 0}
            >
              <option value="">Без папки</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <button className="btn star" onClick={saveToFolder} disabled={!authed || busy || !result?.analysisId}>
              ⭐ Зберегти в «Мої перевірені»
            </button>
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Результат</div>

          {!result ? (
            <div className="muted">Після аналізу тут буде відповідь сервера.</div>
          ) : (
            <div className="resultBox">
              <div><b>Рослина:</b> {result.plantName || "—"}</div>
              <div><b>Стан / Хвороба:</b> {result.diseaseName || result.predictedKey || "—"}</div>
              <div><b>Ймовірність:</b> {typeof result.confidence === "number" ? `${Math.round(result.confidence * 100)}%` : (result.confidence ?? "—")}</div>

              {result.analysisId ? (
                <div className="mutedSmall">analysisId: {result.analysisId}</div>
              ) : (
                <div className="warnSmall">⚠️ Сервер не повернув analysisId — збереження в папку не буде працювати.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
