import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

import authRoutes from "./src/routes/auth.routes.js";
import analyzeRoutes from "./src/routes/analyze.routes.js";
import folderRoutes from "./src/routes/folder.routes.js";
import historyRoutes from "./src/routes/history.routes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --- basic request logger (server console logs) ---
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

app.use(express.json({ limit: "20mb" }));

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

// 404
app.use((req, res) => {
  res.status(404).json({ message: "Not found", path: req.originalUrl });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
