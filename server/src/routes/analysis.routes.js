import express from "express";
import requireAuth from "../middleware/requireAuth.js";

import {
  getHistory,
  getHistoryUnassigned,
  getHistoryByFolder,
  moveHistoryItem,
  deleteHistoryItem,
} from "../controllers/historyController.js";

const router = express.Router();

// HISTORY
router.get("/history", requireAuth, getHistory);
router.get("/history/unassigned", requireAuth, getHistoryUnassigned);
router.get("/history/folder/:folderId", requireAuth, getHistoryByFolder);
router.put("/history/:savedId/move", requireAuth, moveHistoryItem);
router.delete("/history/:savedId", requireAuth, deleteHistoryItem);

export default router;
