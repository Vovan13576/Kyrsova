import db from "../config/db.js";

export default class User {
  static async findByEmail(email) {
    const r = await db.query(`SELECT id, email, password_hash FROM public.users WHERE email=$1 LIMIT 1`, [email]);
    return r.rows[0] || null;
  }

  static async create(email, passwordHash) {
    const r = await db.query(
      `INSERT INTO public.users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
      [email, passwordHash]
    );
    return r.rows[0];
  }
}
