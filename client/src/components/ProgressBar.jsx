export default function ProgressBar({ value = 0 }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: "rgba(255,255,255,0.10)",
          border: "1px solid rgba(255,255,255,0.12)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${v}%`,
            height: "100%",
            borderRadius: 999,
            background: "linear-gradient(90deg, #27c56c 0%, #f3c623 55%, #ff5b5b 100%)"
          }}
        />
      </div>
      <div style={{ marginTop: 6, opacity: 0.85, fontWeight: 800 }}>{v}%</div>
    </div>
  );
}
