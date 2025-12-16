// server/src/controllers/authController.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import db from "../config/db.js";

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set in .env");
  }

  return jwt.sign({ id: user.id, email: user.email }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function tokenResponse(token, user) {
  // ✅ сумісність: фронт може чекати token/accessToken/jwt
  return {
    token,
    accessToken: token,
    jwt: token,
    user,
  };
}

// POST /api/auth/register
export async function register(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "email і password обов'язкові" });
    }

    const exists = await User.findByEmail(email);
    if (exists) {
      return res.status(409).json({ message: "Користувач вже існує" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create(email, passwordHash);
    const token = signToken(user);

    return res.status(201).json(tokenResponse(token, user));
  } catch (e) {
    console.error("register error:", e);
    return res.status(500).json({ message: "Помилка реєстрації" });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: "email і password обов'язкові" });
    }

    const userRow = await User.findByEmail(email);
    if (!userRow) {
      return res.status(401).json({ message: "Невірний email або пароль" });
    }

    const stored = userRow.password_hash || "";

    // підтримка старих plaintext паролів
    let ok = false;
    const passStr = String(password);

    if (stored.startsWith("$2")) {
      ok = await bcrypt.compare(passStr, stored);
    } else {
      ok = passStr === stored;
      if (ok) {
        const newHash = await bcrypt.hash(passStr, 10);
        await db.query("UPDATE public.users SET password_hash=$1 WHERE id=$2", [
          newHash,
          userRow.id,
        ]);
      }
    }

    if (!ok) {
      return res.status(401).json({ message: "Невірний email або пароль" });
    }

    const user = { id: userRow.id, email: userRow.email };
    const token = signToken(user);

    return res.json(tokenResponse(token, user));
  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ message: "Помилка входу" });
  }
}

// GET /api/auth/me
export async function me(req, res) {
  return res.json({ user: req.user });
}
