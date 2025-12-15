import { useEffect, useRef, useState } from "react";

export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setErr("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false
        });
        if (cancelled) return;

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        setErr("Не вдалося відкрити камеру. Перевір дозвіл у браузері.");
      }
    }

    start();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stop() {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function handleClose() {
    stop();
    onClose?.();
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    if (!blob) {
      setErr("Не вдалося зробити фото.");
      return;
    }

    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
    stop();
    onCapture?.(file);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
        padding: 14
      }}
    >
      <div
        className="card"
        style={{
          width: "min(900px, 100%)",
          padding: 14
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Камера</div>
          <button className="btn" onClick={handleClose}>Закрити</button>
        </div>

        {err ? <div style={{ color: "#ffb4b4", fontWeight: 900, marginBottom: 8 }}>{err}</div> : null}

        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)" }}>
          <video ref={videoRef} style={{ width: "100%", display: "block" }} playsInline />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn" onClick={takePhoto}>Зробити фото</button>
          <button className="btn" onClick={handleClose}>Скасувати</button>
        </div>
      </div>
    </div>
  );
}
