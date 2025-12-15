import express from "express";
import requireAuth from "../middleware/requireAuth.js";
import { getFolders, createFolder, renameFolder, deleteFolder } from "../controllers/folderController.js";

const router = express.Router();

router.get("/folders", requireAuth, getFolders);
router.post("/folders", requireAuth, createFolder);
router.put("/folders/:id", requireAuth, renameFolder);
router.delete("/folders/:id", requireAuth, deleteFolder);

export default router;
