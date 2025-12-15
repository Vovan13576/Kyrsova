import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { getFolders, createFolder, renameFolder, deleteFolder } from "../controllers/folderController.js";

const router = Router();

// сумісність: клієнт у тебе інколи бив у /folders/all або навіть /folder
router.get("/folders", authMiddleware, getFolders);
router.get("/folders/all", authMiddleware, getFolders);
router.get("/folder", authMiddleware, getFolders);

router.post("/folders", authMiddleware, createFolder);
router.put("/folders/:id", authMiddleware, renameFolder);
router.delete("/folders/:id", authMiddleware, deleteFolder);

export default router;
