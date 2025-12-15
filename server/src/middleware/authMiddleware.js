import jwt from "jsonwebtoken";

export default function authMiddleware(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };

    return next();
  } catch (e) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}
