import pgPkg from "pg";
const { Pool } = pgPkg;

let _pool = null;
function getPool() {
  if (_pool) return _pool;

  const usingConnectionString = !!process.env.DATABASE_URL;

  _pool = usingConnectionString
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || "plantdb",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
      });

  return _pool;
}

// PATCH /api/history/:analysisId/folder
// body: { folderId: number | null }
export async function moveAnalysisToFolder(req, res) {
  try {
    const userId = req.user?.id;
    const analysisId = Number(req.params.analysisId);
    const { folderId } = req.body || {};

    if (!userId) return res.status(401).json({ ok: false, message: "Неавторизовано" });
    if (!analysisId || Number.isNaN(analysisId)) {
      return res.status(400).json({ ok: false, message: "Некоректний analysisId" });
    }

    const pool = getPool();

    // folderId може бути null => "Без папки"
    const nextFolderId = folderId === null || folderId === undefined || folderId === ""
      ? null
      : Number(folderId);

    if (nextFolderId !== null && Number.isNaN(nextFolderId)) {
      return res.status(400).json({ ok: false, message: "Некоректний folderId" });
    }

    // якщо folderId не null — перевіряємо, що папка належить цьому користувачу
    if (nextFolderId !== null) {
      const f = await pool.query(
        `SELECT id FROM public.folders WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [nextFolderId, userId]
      );
      if (!f.rows?.length) {
        return res.status(404).json({ ok: false, message: "Папку не знайдено або вона не належить користувачу" });
      }
    }

    // оновлюємо folder_id тільки для аналізу цього користувача
    const r = await pool.query(
      `UPDATE public.analysis_results
       SET folder_id = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, folder_id`,
      [nextFolderId, analysisId, userId]
    );

    if (!r.rows?.length) {
      return res.status(404).json({ ok: false, message: "Аналіз не знайдено або він не належить користувачу" });
    }

    return res.json({ ok: true, result: r.rows[0] });
  } catch (e) {
    console.error("moveAnalysisToFolder error:", e);
    return res.status(500).json({ ok: false, message: "Move failed", error: String(e?.message || e) });
  }
}
