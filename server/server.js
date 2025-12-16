import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./src/routes/auth.routes.js";
import analyzeRoutes from "./src/routes/analyze.routes.js";
import folderRoutes from "./src/routes/folder.routes.js";
import historyRoutes from "./src/routes/history.routes.js";

// (не обов'язково) пробуємо підхопити .env якщо dotenv встановлений
try {
  const dotenvMod = await import("dotenv");
  if (typeof dotenvMod?.config === "function") dotenvMod.config();
} catch {
  // якщо dotenv не встановлений — просто ігноруємо
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ---- Request logger (дає тобі "консоль логи") ----
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`
    );
  });
  next();
});

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

// uploads
const uploadsDir = path.resolve(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// routes
app.use("/api", authRoutes);
app.use("/api", analyzeRoutes);
app.use("/api", folderRoutes);
app.use("/api", historyRoutes);

// ---- Global error handler ----
app.use((err, req, res, next) => {
  console.error("❌ Unhandled server error:", err);
  return res.status(500).json({
    message: "Internal Server Error",
    error: process.env.NODE_ENV === "production" ? undefined : String(err?.message || err),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
