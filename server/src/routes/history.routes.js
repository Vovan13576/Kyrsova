import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getHistoryAll,
  getHistoryUnassigned,
  getHistoryByFolder,
  saveToHistory,
  deleteHistoryItem,
  moveHistoryToFolder,
} from "../controllers/historyController.js";

const router = express.Router();

router.get("/history", authMiddleware, getHistoryAll);
router.get("/history/unassigned", authMiddleware, getHistoryUnassigned);
router.get("/history/folder/:id", authMiddleware, getHistoryByFolder);

// зберегти (позначити verified + прив’язати до папки)
router.post("/history/save", authMiddleware, saveToHistory);

// ✅ нове: видалити аналіз
router.delete("/history/:id", authMiddleware, deleteHistoryItem);

// ✅ нове: перенести аналіз в іншу папку (folderId може бути null)
router.put("/history/:id/folder", authMiddleware, moveHistoryToFolder);

export default router;
