import jwt from "jsonwebtoken";

export default function optionalAuthMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email };
    return next();
  } catch {
    // якщо токен битий — просто ігноруємо (але не ламаємо /analyze)
    req.user = null;
    return next();
  }
}
