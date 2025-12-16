import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config(); // ✅ щоб JWT_SECRET точно підхопився

const SECRET = process.env.JWT_SECRET || "DEV_FALLBACK_SECRET_CHANGE_ME";

export default function authMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

    if (!token) {
      return res.status(401).json({ message: "Неавторизовано (no token)" });
    }

    const payload = jwt.verify(token, SECRET);

    req.user = {
      id: payload.id,
      email: payload.email,
    };

    return next();
  } catch (e) {
    return res.status(401).json({ message: "Неавторизовано (bad token)" });
  }
}
