import React, { useEffect, useMemo, useState } from "react";

export default function LogPanel({ height = 220 }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const sync = () => setLogs([...(window.__appLogs || [])]);
    sync();

    const onLog = () => sync();
    window.addEventListener("app_log", onLog);
    return () => window.removeEventListener("app_log", onLog);
  }, []);

  const text = useMemo(() => {
    return logs
      .slice(-200)
      .map((l) => {
        const d = l.data === undefined ? "" : typeof l.data === "string" ? l.data : JSON.stringify(l.data);
        return `${l.time}  ${l.line}  ${d}`;
      })
      .join("\n");
  }, [logs]);

  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(0,0,0,0.28)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "10px 12px", fontWeight: 800, opacity: 0.9 }}>Логи (вбудована консоль)</div>
      <pre
        style={{
          margin: 0,
          height,
          overflow: "auto",
          padding: 12,
          fontSize: 12,
          lineHeight: 1.35,
          whiteSpace: "pre-wrap",
          color: "rgba(255,255,255,0.85)",
        }}
      >
        {text || "Поки що логів немає..."}
      </pre>
    </div>
  );
}
