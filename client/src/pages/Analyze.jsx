import React, { useEffect, useRef, useState } from "react";
import api, { getErrorMessage } from "../services/api";

export default function Analyze() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [stream, setStream] = useState(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    return () => {
      // cleanup
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {}
    setStream(null);
    setCameraOn(false);
  };

  const startCamera = async () => {
    setCameraError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      setStream(s);
      setCameraOn(true);

      // важливо: підключити стрім ДО video
      const v = videoRef.current;
      if (v) {
        v.srcObject = s;
        await v.play().catch(() => {});
      }
    } catch (e) {
      setCameraError(getErrorMessage(e));
      setCameraOn(false);
    }
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResult(null);
    setStatusMsg("");

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f) setPreviewUrl(URL.createObjectURL(f));
    else setPreviewUrl(null);
  };

  const captureFromCamera = async () => {
    setStatusMsg("");
    setResult(null);

    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;

    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;

    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(v, 0, 0, w, h);

    c.toBlob((blob) => {
      if (!blob) return;
      const captured = new File([blob], "camera.jpg", { type: "image/jpeg" });
      setFile(captured);

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(captured));
    }, "image/jpeg", 0.92);
  };

  const clearAll = () => {
    setFile(null);
    setResult(null);
    setStatusMsg("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const runAnalyze = async () => {
    if (!file) {
      setStatusMsg("Спочатку вибери файл або зроби фото.");
      return;
    }

    setLoading(true);
    setStatusMsg("");
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("image", file);

      const { data } = await api.post("/analyze", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResult(data);
    } catch (e) {
      setStatusMsg(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 18 }}>
      <div style={{ marginBottom: 10, color: "#fff" }}>
        {statusMsg ? (
          <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,0,0,0.15)" }}>
            {statusMsg}
          </div>
        ) : null}
        {cameraError ? (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(255,120,0,0.15)" }}>
            Камера: {cameraError}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input type="file" accept="image/*" onChange={onPickFile} />

        {!cameraOn ? (
          <button onClick={startCamera}>Увімкнути камеру</button>
        ) : (
          <>
            <button onClick={stopCamera}>Вимкнути камеру</button>
            <button onClick={captureFromCamera}>Зробити фото (листок по центру)</button>
          </>
        )}

        <button onClick={runAnalyze} disabled={loading}>
          {loading ? "Аналіз..." : "Запустити аналіз"}
        </button>

        <button onClick={clearAll} disabled={loading}>
          Очистити
        </button>
      </div>

      {/* Камера */}
      {cameraOn ? (
        <div style={{ marginBottom: 14 }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: "100%",
              maxWidth: 700,
              height: 360,
              background: "#000",
              borderRadius: 16,
              objectFit: "cover",
              display: "block",
            }}
          />
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 12 }}>
          <div style={{ color: "#fff", fontWeight: 700, marginBottom: 8 }}>Попередній перегляд</div>
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="preview"
              style={{ width: "100%", maxWidth: 520, borderRadius: 14 }}
            />
          ) : (
            <div style={{ color: "rgba(255,255,255,0.6)" }}>Немає зображення</div>
          )}
        </div>

        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 12 }}>
          <div style={{ color: "#fff", fontWeight: 700, marginBottom: 8 }}>Результат</div>

          {!result ? (
            <div style={{ color: "rgba(255,255,255,0.6)" }}>
              Після аналізу тут буде відповідь сервера
            </div>
          ) : (
            <div style={{ color: "#fff" }}>
              {result.plant_detected === false ? (
                <>
                  <div>❗ {result.message}</div>
                  <div style={{ opacity: 0.75, marginTop: 6 }}>
                    plant_ratio: {String(result.plant_ratio ?? "-")}
                  </div>
                </>
              ) : (
                <>
                  <div><b>Рослина:</b> {result.plantName || "-"}</div>
                  <div><b>Стан / Хвороба:</b> {result.diseaseName || "-"}</div>
                  <div><b>Ймовірність:</b> {Math.round((result.confidence || 0) * 100)}%</div>
                  <div style={{ opacity: 0.75, marginTop: 6 }}>
                    plant_ratio: {String(result.plant_ratio ?? "-")}
                  </div>

                  {result.unsure ? (
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(255,255,0,0.12)" }}>
                      ⚠️ Не впевнено. Спробуй інше фото (краще світло, без розмиття).
                    </div>
                  ) : null}

                  {result.disease?.description ? (
                    <div style={{ marginTop: 10, opacity: 0.9 }}>
                      <b>Опис:</b> {result.disease.description}
                    </div>
                  ) : null}

                  {result.disease?.tips ? (
                    <div style={{ marginTop: 10, opacity: 0.9 }}>
                      <b>Поради:</b> {result.disease.tips}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
