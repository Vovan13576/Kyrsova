import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getHistoryAll,
  getHistoryUnassigned,
  getHistoryByFolder,
  saveToHistory,
} from "../controllers/historyController.js";

const router = express.Router();

router.get("/history", authMiddleware, getHistoryAll);
router.get("/history/unassigned", authMiddleware, getHistoryUnassigned);
router.get("/history/folder/:id", authMiddleware, getHistoryByFolder);
router.post("/history/save", authMiddleware, saveToHistory);

export default router;
