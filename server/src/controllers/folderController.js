import db from "../config/db.js";

export async function listFolders(req, res) {
  const userId = req.user.id;
  const r = await db.query(
    `SELECT id, user_id, name, created_at FROM public.folders WHERE user_id=$1 ORDER BY created_at DESC`,
    [userId]
  );
  return res.json({ items: r.rows });
}

export async function createFolder(req, res) {
  const userId = req.user.id;
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ message: "Назва папки обов'язкова" });

  const r = await db.query(
    `INSERT INTO public.folders (user_id, name) VALUES ($1, $2) RETURNING id, user_id, name, created_at`,
    [userId, name]
  );

  return res.json({ ok: true, folder: r.rows[0] });
}

export async function renameFolder(req, res) {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const name = String(req.body?.name || "").trim();

  if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad folder id" });
  if (!name) return res.status(400).json({ message: "Назва папки обов'язкова" });

  const r = await db.query(
    `UPDATE public.folders SET name=$3 WHERE id=$1 AND user_id=$2 RETURNING id, user_id, name, created_at`,
    [id, userId, name]
  );

  if (r.rowCount === 0) return res.status(404).json({ message: "Папка не знайдена" });

  return res.json({ ok: true, folder: r.rows[0] });
}

export async function deleteFolder(req, res) {
  const userId = req.user.id;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad folder id" });

  // відв'язуємо аналізи від папки
  await db.query(`UPDATE public.analysis_results SET folder_id=NULL WHERE user_id=$1 AND folder_id=$2`, [userId, id]);

  const r = await db.query(`DELETE FROM public.folders WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (r.rowCount === 0) return res.status(404).json({ message: "Папка не знайдена" });

  return res.json({ ok: true });
}
