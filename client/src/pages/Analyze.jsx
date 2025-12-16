// client/src/Analyze.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { getServerBaseUrl, getErrorMessage } from "../services/api.js";
import { isAuthed } from "../services/auth.js";

const cardStyle = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 18,
  padding: 18,
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

export default function Analyze() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState("");

  const [cameraOn, setCameraOn] = useState(false);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState("");
  const [result, setResult] = useState(null);

  const canSave = useMemo(() => isAuthed() && !!result?.analysisId, [result]);

  async function loadFolders() {
    try {
      if (!isAuthed()) return;
      const data = await api.get("/folders");
      const items = data?.items || data?.folders || data || [];
      setFolders(Array.isArray(items) ? items : []);
    } catch {
      // тихо
    }
  }

  useEffect(() => {
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    try {
      setBanner("");
      stopCamera();

      setCameraOn(true);

      const tryConstraints = [
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        { video: true, audio: false },
      ];

      let stream = null;
      for (const c of tryConstraints) {
        try {
          // eslint-disable-next-line no-await-in-loop
          stream = await navigator.mediaDevices.getUserMedia(c);
          break;
        } catch {
          stream = null;
        }
      }

      if (!stream) throw new Error("no camera stream");

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = async () => {
        try {
          await video.play();
        } catch {
          // autoplay може блокнутись — але після кліку зазвичай ок
        }
      };
    } catch {
      setCameraOn(false);
      setBanner("Не вдалося відкрити камеру. Дозволь доступ у браузері.");
    }
  }

  function stopCamera() {
    try {
      const video = videoRef.current;
      if (video) {
        video.pause?.();
        video.srcObject = null;
        video.onloadedmetadata = null;
      }

      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    } catch {
      // ignore
    }
    setCameraOn(false);
  }

  function onPickFile(e) {
    setBanner("");
    const f = e.target.files?.[0];
    if (!f) return;

    // якщо вибрали файл — камеру вимикаємо, щоб не “жила”
    stopCamera();

    setFile(f);
    setResult(null);

    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  // ✅ Після фото — “заморожуємо” кадр (зупиняємо камеру)
  function capturePhoto() {
    try {
      setBanner("");

      const video = videoRef.current;
      const stream = streamRef.current;

      if (!video || !stream) {
        setBanner("Камера не увімкнена.");
        return;
      }

      if (!video.videoWidth || !video.videoHeight) {
        setBanner("Камера ще завантажується. Спробуй ще раз через 1 секунду.");
        return;
      }

      // важливо: одразу пауза — візуально “фіксує” кадр
      video.pause?.();

      const w = video.videoWidth;
      const h = video.videoHeight;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setBanner("Не вдалося отримати кадр з камери.");
            return;
          }

          const captured = new File([blob], `camera_${Date.now()}.png`, {
            type: "image/png",
          });

          setFile(captured);
          setResult(null);

          if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(URL.createObjectURL(captured));

          // ✅ і повністю зупиняємо камеру
          stopCamera();
        },
        "image/png",
        0.95
      );
    } catch {
      setBanner("Не вдалося зробити фото з камери.");
    }
  }

  async function runAnalyze() {
    if (!file) {
      setBanner("Спочатку вибери файл або зроби фото з камери.");
      return;
    }

    try {
      setBanner("");
      setLoading(true);
      setResult(null);

      const fd = new FormData();
      fd.append("image", file);

      const data = await api.postForm("/analyze", fd);

      if (!data?.ok) {
        setBanner(data?.message || "Аналіз не вдався.");
        return;
      }

      setResult(data);
    } catch (e) {
      setBanner(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveToFolder() {
    try {
      if (!canSave) return;

      setBanner("");
      const payload = {
        analysisId: result.analysisId,
        folderId: folderId ? Number(folderId) : null,
      };

      const data = await api.post("/history/save", payload);
      if (data?.ok === false) {
        setBanner(data?.message || "Не вдалося зберегти.");
        return;
      }

      setBanner("✅ Збережено в «Мої перевірені»");
    } catch (e) {
      setBanner(getErrorMessage(e));
    }
  }

  function clearAll() {
    setBanner("");
    setResult(null);
    setFile(null);
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  }

  // ---- ОПИС/РЕКОМЕНДАЦІЇ: підтримуємо різні формати відповіді ----
  const diseaseTitle =
    result?.disease?.title ||
    result?.diseaseTitle ||
    result?.disease_name ||
    result?.diseaseName ||
    "";

  const diseaseDesc =
    result?.disease?.description ||
    result?.description ||
    result?.diseaseDescription ||
    result?.disease_desc ||
    "";

  const diseaseTips =
    result?.disease?.tips ||
    result?.tips ||
    result?.recommendations ||
    result?.diseaseTips ||
    result?.disease_tips ||
    "";

  const confidencePct =
    result?.confidence === null || result?.confidence === undefined
      ? null
      : Math.round(Number(result.confidence) * (Number(result.confidence) > 1 ? 1 : 100));

  const previewImgFromServer = toImageUrl(result?.image_path || result?.imagePath || "");

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "22px 16px" }}>
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>
          Plant Disease Detection
        </div>
        <div style={{ opacity: 0.85, marginBottom: 14 }}>
          Завантаж фото або увімкни камеру, зроби кадр і запускай аналіз.
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            📁 Вибрати файл
            <input type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
          </label>

          {!cameraOn ? (
            <button
              onClick={startCamera}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "rgba(70,120,255,0.20)",
                border: "1px solid rgba(70,120,255,0.35)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              📷 Увімкнути камеру
            </button>
          ) : (
            <>
              <button
                onClick={stopCamera}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "rgba(255,90,90,0.18)",
                  border: "1px solid rgba(255,90,90,0.35)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                ⛔ Вимкнути камеру
              </button>

              <button
                onClick={capturePhoto}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                🎯 Зробити фото (листок по центру)
              </button>
            </>
          )}

          <button
            onClick={runAnalyze}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(80,200,120,0.18)",
              border: "1px solid rgba(80,200,120,0.35)",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            ⚡ {loading ? "Аналіз..." : "Запустити аналіз"}
          </button>

          <button
            onClick={clearAll}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            🧽 Очистити
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ opacity: 0.85 }}>Папка:</div>

            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              disabled={!isAuthed()}
              style={{
                minWidth: 180,
                padding: "9px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.12)",
                outline: "none",
              }}
            >
              <option value="">Без папки</option>
              {folders.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.name}
                </option>
              ))}
            </select>

            <button
              onClick={saveToFolder}
              disabled={!canSave}
              title={
                !isAuthed()
                  ? "Увійди, щоб зберігати"
                  : !result?.analysisId
                  ? "Спочатку зроби аналіз"
                  : ""
              }
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: canSave ? "rgba(255,215,0,0.14)" : "rgba(255,255,255,0.05)",
                border: canSave ? "1px solid rgba(255,215,0,0.35)" : "1px solid rgba(255,255,255,0.10)",
                color: "#fff",
                cursor: canSave ? "pointer" : "not-allowed",
                opacity: canSave ? 1 : 0.6,
              }}
            >
              ⭐ Зберегти в «Мої перевірені»
            </button>
          </div>
        </div>

        {banner ? (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(255,120,120,0.12)",
              border: "1px solid rgba(255,120,120,0.22)",
            }}
          >
            {banner}
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ ...cardStyle }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Попередній перегляд</div>

          <div
            style={{
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.25)",
              height: 360,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {cameraOn ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div style={{ opacity: 0.75, padding: 18, textAlign: "center" }}>
                Немає зображення. <br /> Завантаж фото або увімкни камеру.
              </div>
            )}
          </div>

          {/* текст під камерою — прибрано */}
        </div>

        <div style={{ ...cardStyle }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Результат</div>

            {confidencePct !== null ? (
              <div
                style={{
                  marginLeft: "auto",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  fontWeight: 800,
                }}
              >
                {confidencePct}%
              </div>
            ) : null}
          </div>

          {!result ? (
            <div style={{ opacity: 0.8 }}>
              Після аналізу тут буде відповідь сервера (рослина, хвороба, ймовірність, опис і рекомендації).
            </div>
          ) : (
            <>
              <div style={{ lineHeight: 1.65 }}>
                <div>
                  <b>Рослина:</b> {result.plantName || "—"}
                </div>
                <div>
                  <b>Стан / Хвороба:</b> {diseaseTitle || result.diseaseName || "—"}
                </div>
                {result.analysisId ? (
                  <div style={{ opacity: 0.85, marginTop: 6 }}>analysisId: {result.analysisId}</div>
                ) : null}
              </div>

              {(diseaseDesc || diseaseTips) ? (
                <div style={{ marginTop: 14 }}>
                  {diseaseDesc ? (
                    <>
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Опис</div>
                      <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>{diseaseDesc}</div>
                    </>
                  ) : null}

                  {diseaseTips ? (
                    <>
                      <div style={{ fontWeight: 900, marginTop: 12, marginBottom: 6 }}>Рекомендації</div>
                      <div style={{ opacity: 0.9, whiteSpace: "pre-wrap" }}>{diseaseTips}</div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div style={{ marginTop: 12, opacity: 0.75 }}>
                  Немає опису/рекомендацій для цього ключа в таблиці diseases.
                </div>
              )}

              {previewImgFromServer ? (
                <div style={{ marginTop: 14, opacity: 0.0, height: 0, overflow: "hidden" }}>
                  {/* нічого не міняємо в UI, просто залишаю гачок якщо треба */}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
