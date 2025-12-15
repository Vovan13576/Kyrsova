import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import db from "../config/db.js";

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
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

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create(email, passwordHash);
    const token = signToken(user);

    return res.status(201).json({ token, user });
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

    // підтримка старих plaintext паролів (як у тебе було в users)
    let ok = false;
    if (stored.startsWith("$2")) {
      ok = await bcrypt.compare(password, stored);
    } else {
      ok = password === stored;
      if (ok) {
        const newHash = await bcrypt.hash(password, 10);
        await db.query("UPDATE public.users SET password_hash=$1 WHERE id=$2", [newHash, userRow.id]);
      }
    }

    if (!ok) {
      return res.status(401).json({ message: "Невірний email або пароль" });
    }

    const user = { id: userRow.id, email: userRow.email };
    const token = signToken(user);

    return res.json({ token, user });
  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ message: "Помилка входу" });
  }
}

// GET /api/auth/me
export async function me(req, res) {
  return res.json({ user: req.user });
}
