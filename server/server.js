import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import analyzeRoutes from "./src/routes/analyze.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import analysisRoutes from "./src/routes/analysis.routes.js";
import folderRoutes from "./src/routes/folder.routes.js";
import historyRoutes from "./src/routes/history.routes.js";

const app = express();
app.use(express.json());

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// щоб фронт міг показувати фото
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api", authRoutes);
app.use("/api", analyzeRoutes);
app.use("/api", analysisRoutes);
app.use("/api", folderRoutes);
app.use("/api", historyRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`Server running on port ${port}`));
