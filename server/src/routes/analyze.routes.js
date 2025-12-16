import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ✅ ВАЖЛИВО: routes -> controllers це "../controllers", а не "./controllers"
import { analyzePlant, verifyAnalysis } from "../controllers/analyzeController.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// uploads/analyze
const uploadDir = path.join(__dirname, "..", "..", "uploads", "analyze");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".jpg";
    const name = `leaf_${Date.now()}_${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, name);
  },
});

const upload = multer({ storage });

// POST /api/analyze  (multipart/form-data, поле "image")
router.post("/", upload.single("image"), analyzePlant);

// POST /api/analyze/verify  (JSON: { analysisId, verified })
router.post("/verify", verifyAnalysis);

export default router;
