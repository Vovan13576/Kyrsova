import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getHistoryAll,
  getHistoryUnassigned,
  getHistoryByFolder,
  deleteHistoryItem,
  moveHistoryItem,
} from "../controllers/historyController.js";

const router = Router();

router.get("/history", authMiddleware, getHistoryAll);
router.get("/history/unassigned", authMiddleware, getHistoryUnassigned);
router.get("/history/folder/:folderId", authMiddleware, getHistoryByFolder);

router.delete("/history/:savedId", authMiddleware, deleteHistoryItem);
router.put("/history/:savedId/move", authMiddleware, moveHistoryItem);

export default router;
