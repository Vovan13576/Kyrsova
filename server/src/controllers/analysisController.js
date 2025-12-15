import db from "../config/db.js";

function normFolderId(v) {
  if (v === undefined || v === null) return null;
  if (v === "none" || v === "" || v === "null") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// GET /api/history?folderId=all|none|<id>
export const getHistory = async (req, res) => {
  const userId = req.user?.id || 1;
  const folderIdRaw = req.query.folderId ?? "all";

  try {
    let where = `WHERE sr.user_id = $1`;
    const params = [userId];

    if (folderIdRaw === "none") {
      where += ` AND sr.folder_id IS NULL`;
    } else if (folderIdRaw !== "all") {
      const folderId = Number(folderIdRaw);
      if (Number.isFinite(folderId)) {
        params.push(folderId);
        where += ` AND sr.folder_id = $2`;
      }
    }

    const q = `
      SELECT
        sr.id                 AS "savedId",
        sr.folder_id          AS "folderId",
        sr.saved_at           AS "savedAt",
        ar.id                 AS "analysisId",
        ar.predicted_key      AS "predictedKey",
        ar.confidence         AS "confidence",
        ar.image_path         AS "imagePath",
        ar.created_at         AS "createdAt",
        ar.verified           AS "verified",
        d.key                 AS "diseaseKey",
        d.title               AS "title",
        d.description         AS "description",
        d.tips                AS "tips"
      FROM public.saved_results sr
      JOIN public.analysis_results ar ON ar.id = sr.analysis_result_id
      LEFT JOIN public.diseases d ON d.key = ar.predicted_key
      ${where}
      ORDER BY sr.saved_at DESC
      LIMIT 200
    `;

    const r = await db.query(q, params);

    const items = r.rows.map((row) => ({
      savedId: row.savedId,
      folderId: row.folderId,
      savedAt: row.savedAt,
      analysisId: row.analysisId,
      predictedKey: row.predictedKey,
      confidence: row.confidence,
      createdAt: row.createdAt,
      verified: row.verified === true,
      imageUrl: row.imagePath ? `/uploads/${row.imagePath}` : null,
      disease: row.diseaseKey
        ? {
            key: row.diseaseKey,
            title: row.title,
            description: row.description,
            tips: row.tips,
          }
        : null,
    }));

    return res.json({ items });
  } catch (err) {
    console.error("❌ getHistory error:", err);
    return res.status(500).json({ error: "Не вдалося завантажити історію." });
  }
};

// POST /api/analysis/:id/verify  body: { folderId? }
export const verifyAnalysis = async (req, res) => {
  const userId = req.user?.id || 1;
  const analysisId = Number(req.params.id);
  const folderId = normFolderId(req.body?.folderId);

  if (!Number.isFinite(analysisId)) {
    return res.status(400).json({ error: "Некоректний analysisId" });
  }

  try {
    // перевіряємо що analysis існує і належить користувачу
    const a = await db.query(
      `SELECT id, user_id FROM public.analysis_results WHERE id=$1 LIMIT 1`,
      [analysisId]
    );
    const row = a.rows[0];
    if (!row) return res.status(404).json({ error: "Аналіз не знайдено" });

    // (якщо в тебе user_id в analysis_results реальний — перевірка)
    if (Number(row.user_id) !== Number(userId)) {
      // щоб не блокувало, якщо ти поки юзаєш userId=1 всюди:
      // можеш закоментити цей блок, але краще залишити.
      // return res.status(403).json({ error: "Немає доступу" });
    }

    // 1) ставимо verified=true (без verified_at!)
    await db.query(
      `UPDATE public.analysis_results SET verified=true WHERE id=$1`,
      [analysisId]
    );

    // 2) додаємо/оновлюємо saved_results (UNIQUE user+analysis)
    const saved = await db.query(
      `
      INSERT INTO public.saved_results (user_id, analysis_result_id, folder_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, analysis_result_id)
      DO UPDATE SET folder_id = EXCLUDED.folder_id, saved_at = NOW()
      RETURNING id, user_id, analysis_result_id, folder_id, saved_at
      `,
      [userId, analysisId, folderId]
    );

    return res.json({
      saved: {
        savedId: saved.rows[0].id,
        analysisId: saved.rows[0].analysis_result_id,
        folderId: saved.rows[0].folder_id,
        savedAt: saved.rows[0].saved_at,
      },
    });
  } catch (err) {
    console.error("❌ verifyAnalysis error:", err);
    return res.status(500).json({ error: "Не вдалося зберегти як перевірене." });
  }
};

// DELETE /api/saved/:id
export const deleteSaved = async (req, res) => {
  const userId = req.user?.id || 1;
  const savedId = Number(req.params.id);
  if (!Number.isFinite(savedId)) return res.status(400).json({ error: "Некоректний id" });

  try {
    const del = await db.query(
      `DELETE FROM public.saved_results WHERE id=$1 AND user_id=$2 RETURNING id`,
      [savedId, userId]
    );
    if (del.rowCount === 0) return res.status(404).json({ error: "Запис не знайдено" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("❌ deleteSaved error:", err);
    return res.status(500).json({ error: "Не вдалося видалити." });
  }
};

// PUT /api/saved/:id/folder  body: { folderId }
export const moveSavedToFolder = async (req, res) => {
  const userId = req.user?.id || 1;
  const savedId = Number(req.params.id);
  const folderId = normFolderId(req.body?.folderId);

  if (!Number.isFinite(savedId)) return res.status(400).json({ error: "Некоректний id" });

  try {
    const up = await db.query(
      `
      UPDATE public.saved_results
      SET folder_id = $1
      WHERE id = $2 AND user_id = $3
      RETURNING id, folder_id, analysis_result_id
      `,
      [folderId, savedId, userId]
    );

    if (up.rowCount === 0) return res.status(404).json({ error: "Запис не знайдено" });

    return res.json({
      saved: {
        savedId: up.rows[0].id,
        folderId: up.rows[0].folder_id,
        analysisId: up.rows[0].analysis_result_id,
      },
    });
  } catch (err) {
    console.error("❌ moveSavedToFolder error:", err);
    return res.status(500).json({ error: "Не вдалося перемістити." });
  }
};

// PUT /api/analysis/:id/folder  body: { folderId }  (аліас, щоб не було 404)
export const setAnalysisFolder = async (req, res) => {
  const userId = req.user?.id || 1;
  const analysisId = Number(req.params.id);
  const folderId = normFolderId(req.body?.folderId);

  if (!Number.isFinite(analysisId)) return res.status(400).json({ error: "Некоректний analysisId" });

  try {
    const up = await db.query(
      `
      UPDATE public.saved_results
      SET folder_id = $1
      WHERE user_id = $2 AND analysis_result_id = $3
      RETURNING id, folder_id
      `,
      [folderId, userId, analysisId]
    );

    if (up.rowCount === 0) return res.status(404).json({ error: "Перевірений запис не знайдено" });

    return res.json({
      saved: {
        savedId: up.rows[0].id,
        folderId: up.rows[0].folder_id,
      },
    });
  } catch (err) {
    console.error("❌ setAnalysisFolder error:", err);
    return res.status(500).json({ error: "Не вдалося змінити папку." });
  }
};
