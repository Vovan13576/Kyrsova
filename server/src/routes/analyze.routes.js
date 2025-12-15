import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import authMiddleware from "../middleware/authMiddleware.js";
import { analyzePlant, verifyAnalysis } from "../controllers/analyzeController.js";

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.resolve(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}_${Math.random().toString(16).slice(2)}${path.extname(
      file.originalname || ".jpg"
    )}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });

// ✅ аналіз без auth (щоб не ловити 401)
router.post("/analyze", upload.single("image"), analyzePlant);

// ✅ verify — тільки з токеном
router.post("/analyze/:id/verify", authMiddleware, verifyAnalysis);

export default router;
