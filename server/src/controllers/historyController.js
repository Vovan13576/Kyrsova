import db from "../config/db.js";

function mapRow(row) {
  return {
    id: row.id,
    predictedKey: row.predicted_key,
    confidence: row.confidence,
    createdAt: row.created_at,
    imageUrl: row.image_path ? `/uploads/${row.image_path}` : null,
    verified: row.verified,
    folderId: row.folder_id,
    plantName: row.plant_name || null,
    diseaseName: row.disease_name || null,
    diseaseTitle: row.disease_title || null,
  };
}

export async function getHistoryAll(req, res) {
  const userId = req.user.id;

  const r = await db.query(
    `
    SELECT
      ar.*,
      d.title as disease_title
    FROM public.analysis_results ar
    LEFT JOIN public.diseases d ON d.key = ar.predicted_key
    WHERE ar.user_id = $1 AND ar.verified = true
    ORDER BY ar.created_at DESC
    `,
    [userId]
  );

  return res.json({ items: r.rows.map(mapRow) });
}

export async function getHistoryUnassigned(req, res) {
  const userId = req.user.id;

  const r = await db.query(
    `
    SELECT ar.*, d.title as disease_title
    FROM public.analysis_results ar
    LEFT JOIN public.diseases d ON d.key = ar.predicted_key
    WHERE ar.user_id = $1 AND ar.verified = true AND ar.folder_id IS NULL
    ORDER BY ar.created_at DESC
    `,
    [userId]
  );

  return res.json({ items: r.rows.map(mapRow) });
}

export async function getHistoryByFolder(req, res) {
  const userId = req.user.id;
  const folderId = Number(req.params.id);
  if (!Number.isFinite(folderId)) return res.status(400).json({ message: "Bad folder id" });

  const r = await db.query(
    `
    SELECT ar.*, d.title as disease_title
    FROM public.analysis_results ar
    LEFT JOIN public.diseases d ON d.key = ar.predicted_key
    WHERE ar.user_id = $1 AND ar.verified = true AND ar.folder_id = $2
    ORDER BY ar.created_at DESC
    `,
    [userId, folderId]
  );

  return res.json({ items: r.rows.map(mapRow) });
}

// body: { analysisId, folderId }
export async function saveToHistory(req, res) {
  const userId = req.user.id;
  const { analysisId, folderId } = req.body || {};

  const id = Number(analysisId);
  const fId = folderId === null || folderId === undefined || folderId === "" ? null : Number(folderId);

  if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad analysisId" });
  if (fId !== null && !Number.isFinite(fId)) return res.status(400).json({ message: "Bad folderId" });

  // Перевіряємо, що аналіз належить користувачу
  const own = await db.query(`SELECT id FROM public.analysis_results WHERE id=$1 AND user_id=$2 LIMIT 1`, [id, userId]);
  if (own.rowCount === 0) {
    return res.status(404).json({ message: "Analysis не знайдено або не належить користувачу" });
  }

  // Якщо folderId заданий — перевіряємо що папка належить користувачу
  if (fId !== null) {
    const fr = await db.query(`SELECT id FROM public.folders WHERE id=$1 AND user_id=$2 LIMIT 1`, [fId, userId]);
    if (fr.rowCount === 0) return res.status(404).json({ message: "Папка не знайдена або не твоя" });
  }

  const upd = await db.query(
    `
    UPDATE public.analysis_results
    SET verified = true, verified_at = NOW(), folder_id = $3
    WHERE id = $1 AND user_id = $2
    RETURNING id, verified, folder_id
    `,
    [id, userId, fId]
  );

  return res.json({ ok: true, item: upd.rows[0] });
}
