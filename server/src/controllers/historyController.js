import db from "../config/db.js";

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parsePredictedKey(predictedKey) {
  const s = String(predictedKey || "");
  // PlantVillage формат: Plant___Disease
  if (!s.includes("___")) return { plant: null, disease: null };

  const [plantRaw, diseaseRaw] = s.split("___");
  const plant = plantRaw.replaceAll("_", " ").trim();
  const disease = diseaseRaw.replaceAll("_", " ").trim();
  return { plant, disease };
}

function isHealthyKey(predictedKey) {
  const s = String(predictedKey || "").toLowerCase();
  return s.endsWith("___healthy") || s.includes("healthy");
}

// --------- GET /api/history (усі збережені) ----------
export async function getHistoryAll(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const r = await db.query(
      `
      SELECT
        sr.id AS "savedId",
        sr.folder_id AS "folderId",
        sr.saved_at AS "savedAt",

        ar.id AS "analysisId",
        ar.predicted_key AS "predictedKey",
        ar.confidence AS "confidence",
        ar.created_at AS "createdAt",
        ar.image_path AS "imagePath",

        d.title AS "diseaseTitle",
        d.description AS "description",
        d.tips AS "tips"
      FROM public.saved_results sr
      JOIN public.analysis_results ar
        ON ar.id = sr.analysis_result_id
      LEFT JOIN public.diseases d
        ON d.key = ar.predicted_key
      WHERE sr.user_id = $1
      ORDER BY sr.saved_at DESC
      `,
      [userId]
    );

    const items = (r.rows || []).map((x) => {
      const { plant, disease } = parsePredictedKey(x.predictedKey);
      return {
        ...x,
        plant,
        disease,
        isHealthy: isHealthyKey(x.predictedKey),
      };
    });

    return res.json({ items });
  } catch (e) {
    console.error("getHistoryAll error:", e);
    return res.status(500).json({ message: "Помилка завантаження історії" });
  }
}

// alias для сумісності (де імпортують getHistory)
export async function getHistory(req, res) {
  return getHistoryAll(req, res);
}

// --------- GET /api/history/unassigned ----------
export async function getHistoryUnassigned(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const r = await db.query(
      `
      SELECT
        sr.id AS "savedId",
        sr.folder_id AS "folderId",
        sr.saved_at AS "savedAt",

        ar.id AS "analysisId",
        ar.predicted_key AS "predictedKey",
        ar.confidence AS "confidence",
        ar.created_at AS "createdAt",
        ar.image_path AS "imagePath",

        d.title AS "diseaseTitle",
        d.description AS "description",
        d.tips AS "tips"
      FROM public.saved_results sr
      JOIN public.analysis_results ar
        ON ar.id = sr.analysis_result_id
      LEFT JOIN public.diseases d
        ON d.key = ar.predicted_key
      WHERE sr.user_id = $1 AND sr.folder_id IS NULL
      ORDER BY sr.saved_at DESC
      `,
      [userId]
    );

    const items = (r.rows || []).map((x) => {
      const { plant, disease } = parsePredictedKey(x.predictedKey);
      return { ...x, plant, disease, isHealthy: isHealthyKey(x.predictedKey) };
    });

    return res.json({ items });
  } catch (e) {
    console.error("getHistoryUnassigned error:", e);
    return res.status(500).json({ message: "Помилка завантаження історії" });
  }
}

// --------- GET /api/history/folder/:folderId ----------
export async function getHistoryByFolder(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const folderId = toInt(req.params.folderId);
    if (folderId == null) return res.status(400).json({ message: "Некоректний folderId" });

    const r = await db.query(
      `
      SELECT
        sr.id AS "savedId",
        sr.folder_id AS "folderId",
        sr.saved_at AS "savedAt",

        ar.id AS "analysisId",
        ar.predicted_key AS "predictedKey",
        ar.confidence AS "confidence",
        ar.created_at AS "createdAt",
        ar.image_path AS "imagePath",

        d.title AS "diseaseTitle",
        d.description AS "description",
        d.tips AS "tips"
      FROM public.saved_results sr
      JOIN public.analysis_results ar
        ON ar.id = sr.analysis_result_id
      LEFT JOIN public.diseases d
        ON d.key = ar.predicted_key
      WHERE sr.user_id = $1 AND sr.folder_id = $2
      ORDER BY sr.saved_at DESC
      `,
      [userId, folderId]
    );

    const items = (r.rows || []).map((x) => {
      const { plant, disease } = parsePredictedKey(x.predictedKey);
      return { ...x, plant, disease, isHealthy: isHealthyKey(x.predictedKey) };
    });

    return res.json({ items });
  } catch (e) {
    console.error("getHistoryByFolder error:", e);
    return res.status(500).json({ message: "Помилка завантаження історії" });
  }
}

// --------- POST /api/history (зберегти в saved_results) ----------
export async function saveHistoryItem(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const folderIdRaw = req.body?.folderId;
    const folderId = folderIdRaw === "" || folderIdRaw === undefined ? null : toInt(folderIdRaw);

    // 1) пробуємо взяти analysisId напряму
    let analysisId =
      toInt(req.body?.analysisId) ??
      toInt(req.body?.analysisResultId) ??
      toInt(req.body?.result?.analysisId) ??
      toInt(req.body?.result?.analysisResultId) ??
      toInt(req.body?.result?.analysis_id) ??
      toInt(req.body?.result?.id);

    // 2) якщо analysisId немає — fallback: створимо analysis_results з даних result
    if (!analysisId) {
      const r0 = req.body?.result || req.body || {};
      const predictedKey =
        r0.predictedKey || r0.predicted_key || r0.label || r0.prediction || null;

      const confidence =
        (typeof r0.confidence === "number" ? r0.confidence : null) ??
        (typeof r0.probability === "number" ? r0.probability : null) ??
        (typeof r0.score === "number" ? r0.score : null) ??
        null;

      // image_path: очікуємо filename типу upload_....jpg
      const imagePath =
        r0.imagePath || r0.image_path || r0.imageUrl || r0.image_url || null;

      if (!predictedKey || confidence == null) {
        return res.status(400).json({ message: "Немає analysisId або недостатньо даних для створення analysis_results" });
      }

      const ins = await db.query(
        `
        INSERT INTO public.analysis_results (user_id, predicted_key, confidence, image_path, verified)
        VALUES ($1, $2, $3, $4, false)
        RETURNING id
        `,
        [userId, predictedKey, confidence, imagePath]
      );

      analysisId = ins.rows?.[0]?.id;
    }

    // перевірка: analysis_results має бути твоїм
    const chk = await db.query(
      `SELECT id FROM public.analysis_results WHERE id = $1 AND user_id = $2`,
      [analysisId, userId]
    );
    if (!chk.rows?.length) return res.status(404).json({ message: "Analysis не знайдено або не належить користувачу" });

    // якщо вже збережено — просто оновимо folder_id + saved_at
    const existing = await db.query(
      `
      SELECT id FROM public.saved_results
      WHERE user_id = $1 AND analysis_result_id = $2
      `,
      [userId, analysisId]
    );

    if (existing.rows?.length) {
      const upd = await db.query(
        `
        UPDATE public.saved_results
        SET folder_id = $1, saved_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING id AS "savedId"
        `,
        [folderId, existing.rows[0].id, userId]
      );
      return res.json({ ok: true, savedId: upd.rows?.[0]?.savedId, updated: true });
    }

    const r = await db.query(
      `
      INSERT INTO public.saved_results (user_id, analysis_result_id, saved_at, folder_id)
      VALUES ($1, $2, NOW(), $3)
      RETURNING id AS "savedId"
      `,
      [userId, analysisId, folderId]
    );

    return res.json({ ok: true, savedId: r.rows?.[0]?.savedId, created: true });
  } catch (e) {
    console.error("saveHistoryItem error:", e);
    return res.status(500).json({ message: "Помилка збереження" });
  }
}

// --------- PUT /api/history/:savedId/move ----------
export async function moveHistoryItem(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const savedId = toInt(req.params.savedId);
    if (savedId == null) return res.status(400).json({ message: "Некоректний savedId" });

    const folderIdRaw = req.body?.folderId;
    const folderId = folderIdRaw === "" || folderIdRaw === undefined ? null : toInt(folderIdRaw);

    const r = await db.query(
      `
      UPDATE public.saved_results
      SET folder_id = $1
      WHERE id = $2 AND user_id = $3
      RETURNING id AS "savedId", folder_id AS "folderId"
      `,
      [folderId, savedId, userId]
    );

    if (!r.rows?.length) return res.status(404).json({ message: "Запис не знайдено" });
    return res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error("moveHistoryItem error:", e);
    return res.status(500).json({ message: "Помилка переміщення" });
  }
}

// --------- DELETE /api/history/:savedId ----------
export async function deleteHistoryItem(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const savedId = toInt(req.params.savedId);
    if (savedId == null) return res.status(400).json({ message: "Некоректний savedId" });

    const r = await db.query(
      `
      DELETE FROM public.saved_results
      WHERE id = $1 AND user_id = $2
      RETURNING id AS "savedId"
      `,
      [savedId, userId]
    );

    if (!r.rows?.length) return res.status(404).json({ message: "Запис не знайдено" });
    return res.json({ ok: true, savedId: r.rows[0].savedId });
  } catch (e) {
    console.error("deleteHistoryItem error:", e);
    return res.status(500).json({ message: "Помилка видалення" });
  }
}
