// server/src/models/User.js
import db from "../config/db.js";

const User = {
  async findByEmail(email) {
    const { rows } = await db.query(
      "SELECT id, email, password_hash FROM public.users WHERE email = $1 LIMIT 1",
      [email]
    );
    return rows[0] || null;
  },

  async create(email, passwordHash) {
    const { rows } = await db.query(
      "INSERT INTO public.users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );
    return rows[0];
  },
};

export default User;
