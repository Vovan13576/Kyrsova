import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { login, register, me } from "../controllers/authController.js";

const router = express.Router();

// НОВІ (під клієнт, який викликає /auth/...)
router.post("/auth/register", register);
router.post("/auth/login", login);
router.get("/auth/me", authMiddleware, me);

// СТАРІ (щоб нічого не поламалось, якщо десь ще є /login,/register)
router.post("/register", register);
router.post("/login", login);

export default router;
