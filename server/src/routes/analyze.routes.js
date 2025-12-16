import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

import authMiddleware from "../middleware/authMiddleware.js";
import optionalAuthMiddleware from "../middleware/optionalAuthMiddleware.js";
import { analyzePlant, verifyAnalysis } from "../controllers/analyzeController.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// uploads into /server/uploads (same as server.js serves)
const uploadsDir = path.resolve(__dirname, "../../uploads");
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ВАЖЛИВО: optionalAuthMiddleware -> якщо залогінений, то req.user буде
router.post("/analyze", optionalAuthMiddleware, upload.single("image"), analyzePlant);

// verify тільки для залогіненого
router.post("/analyze/:id/verify", authMiddleware, verifyAnalysis);

export default router;
