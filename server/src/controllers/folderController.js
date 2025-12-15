import db from "../config/db.js";

// GET /api/folders  (і /api/folders/all)
export async function getFolders(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const r = await db.query(
      `
      SELECT id, name, created_at
      FROM public.folders
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );

    return res.json({ items: r.rows || [] });
  } catch (e) {
    console.error("getFolders error:", e);
    return res.status(500).json({ message: "Помилка завантаження папок" });
  }
}

// POST /api/folders { name }
export async function createFolder(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "Вкажи назву папки" });
    if (name.length > 80) return res.status(400).json({ message: "Занадто довга назва" });

    const r = await db.query(
      `
      INSERT INTO public.folders (user_id, name)
      VALUES ($1, $2)
      RETURNING id, name, created_at
      `,
      [userId, name]
    );

    return res.json({ ok: true, folder: r.rows[0] });
  } catch (e) {
    console.error("createFolder error:", e);
    return res.status(500).json({ message: "Помилка створення папки" });
  }
}

// PUT /api/folders/:id { name }
export async function renameFolder(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad folder id" });

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "Вкажи назву папки" });

    const r = await db.query(
      `
      UPDATE public.folders
      SET name = $1
      WHERE id = $2 AND user_id = $3
      RETURNING id, name, created_at
      `,
      [name, id, userId]
    );

    if (!r.rows?.length) return res.status(404).json({ message: "Папку не знайдено" });

    return res.json({ ok: true, folder: r.rows[0] });
  } catch (e) {
    console.error("renameFolder error:", e);
    return res.status(500).json({ message: "Помилка перейменування" });
  }
}

// DELETE /api/folders/:id
export async function deleteFolder(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad folder id" });

    // відв’язуємо saved_results від папки
    await db.query(
      `
      UPDATE public.saved_results
      SET folder_id = NULL
      WHERE folder_id = $1 AND user_id = $2
      `,
      [id, userId]
    );

    const r = await db.query(
      `
      DELETE FROM public.folders
      WHERE id = $1 AND user_id = $2
      RETURNING id
      `,
      [id, userId]
    );

    if (!r.rows?.length) return res.status(404).json({ message: "Папку не знайдено" });

    return res.json({ ok: true, id });
  } catch (e) {
    console.error("deleteFolder error:", e);
    return res.status(500).json({ message: "Помилка видалення папки" });
  }
}
