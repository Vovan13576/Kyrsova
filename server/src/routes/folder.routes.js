import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { listFolders, createFolder, renameFolder, deleteFolder } from "../controllers/folderController.js";

const router = express.Router();

router.get("/folders", authMiddleware, listFolders);
router.post("/folders", authMiddleware, createFolder);
router.put("/folders/:id", authMiddleware, renameFolder);
router.delete("/folders/:id", authMiddleware, deleteFolder);

export default router;
