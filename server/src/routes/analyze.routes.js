import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import { analyzePlant } from "../controllers/analyzeController.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// uploads лежить у server/uploads
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // без розширення теж ок, але краще з ним
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext && ext.length <= 10 ? ext : ".jpg";
    cb(null, `upload_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`);
  },
});

function fileFilter(req, file, cb) {
  const ok = /^image\/(jpeg|jpg|png|webp)$/i.test(file.mimetype);
  if (!ok) return cb(new Error("Only images are allowed (jpg/png/webp)"), false);
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ВАЖЛИВО: тут НЕ має бути "/api"
router.post("/analyze", upload.single("image"), analyzePlant);

export default router;
