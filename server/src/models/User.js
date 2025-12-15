import db from "../config/db.js";

class User {
  static async findByEmail(email) {
    const res = await db.query(
      'SELECT id, email, password_hash FROM public.users WHERE email = $1',
      [email]
    );
    return res.rows[0] || null;
  }

  static async create(email, passwordHash) {
    const res = await db.query(
      "INSERT INTO public.users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );
    return res.rows[0];
  }

  static async findById(id) {
    const res = await db.query(
      "SELECT id, email FROM public.users WHERE id = $1",
      [id]
    );
    return res.rows[0] || null;
  }
}

export default User;
