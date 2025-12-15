import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./src/routes/auth.routes.js";
import analyzeRoutes from "./src/routes/analyze.routes.js";
import folderRoutes from "./src/routes/folder.routes.js";
import historyRoutes from "./src/routes/history.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
