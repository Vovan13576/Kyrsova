import db from "../config/db.js";

/**
 * Контролер історії (saved_results + analysis_results + diseases)
 * Робить:
 *  - GET /api/history
 *  - GET /api/history/unassigned
 *  - GET /api/history/folder/:id
 *  - PUT /api/history/:id        { folderId: number|null }
 *  - DELETE /api/history/:id
 *
 * Важливо: в різних версіях БД можуть відрізнятися назви колонок.
 * Тому тут є resolveSchema() який підхоплює реальні колонки через information_schema.
 */

let _schema = null;

function ident(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

function firstExisting(colSet, candidates) {
  for (const c of candidates) {
    if (colSet.has(c)) return c;
  }
  return null;
}

async function tableExists(tableName) {
  const r = await db.query("SELECT to_regclass($1) AS reg", [`public.${tableName}`]);
  return !!r.rows?.[0]?.reg;
}

async function getColumns(tableName) {
  const r = await db.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    `,
    [tableName]
  );
  return new Set((r.rows || []).map((x) => x.column_name));
}

async function resolveSchema() {
  if (_schema) return _schema;

  const hasSaved = await tableExists("saved_results");
  if (!hasSaved) throw new Error("DB schema mismatch. Missing table: public.saved_results");

  const hasAnalysis = await tableExists("analysis_results");
  if (!hasAnalysis) throw new Error("DB schema mismatch. Missing table: public.analysis_results");

  const savedCols = await getColumns("saved_results");
  const analysisCols = await getColumns("analysis_results");

  // saved_results
  const srId = firstExisting(savedCols, ["id", "saved_id", "savedid"]);
  const srFolderId = firstExisting(savedCols, ["folder_id", "folderid"]);
  const srSavedAt = firstExisting(savedCols, ["saved_at", "savedat", "created_at"]);
  const srUserId = firstExisting(savedCols, ["user_id", "userid"]);

  // FK на analysis_results
  const srAnalysisFk = firstExisting(savedCols, [
    "analysis_result_id",
    "analysis_id",
    "analysisid",
    "analysisresultid",
  ]);

  // analysis_results
  const arPk = firstExisting(analysisCols, ["id", "analysis_id", "analysisid"]);
  const arPredictedKey = firstExisting(analysisCols, ["predicted_key", "predictedkey"]);
  const arConfidence = firstExisting(analysisCols, ["confidence", "probability", "score"]);
  const arCreatedAt = firstExisting(analysisCols, ["created_at", "createdat"]);
  const arVerified = firstExisting(analysisCols, ["verified", "is_verified", "isverified"]);
  const arUserId = firstExisting(analysisCols, ["user_id", "userid"]);

  // image колонка може бути в analysis_results або в saved_results
  const arImage = firstExisting(analysisCols, [
    "image_url",
    "image",
    "image_path",
    "file_path",
    "filepath",
    "path",
  ]);
  const srImage = firstExisting(savedCols, ["image_url", "image", "image_path", "file_path", "filepath", "path"]);

  // diseases (не обовʼязково існує)
  const hasDiseases = await tableExists("diseases");
  let dCols = null;
  let dKey = null,
    dTitle = null,
    dDesc = null,
    dTips = null;
  if (hasDiseases) {
    dCols = await getColumns("diseases");
    dKey = firstExisting(dCols, ["key", "disease_key"]);
    dTitle = firstExisting(dCols, ["title", "name"]);
    dDesc = firstExisting(dCols, ["description", "desc"]);
    dTips = firstExisting(dCols, ["tips", "recommendations", "recs"]);
  }

  // мінімально необхідні колонки
  const missing = [];
  if (!srId) missing.push("saved_results.id");
  if (!arPk) missing.push("analysis_results.id");
  if (!srAnalysisFk) missing.push("saved_results.(analysis_result_id|analysis_id)");
  if (!arPredictedKey) missing.push("analysis_results.predicted_key");
  if (!arConfidence) missing.push("analysis_results.confidence");

  if (missing.length) {
    throw new Error(`DB schema mismatch. Missing: ${missing.join(", ")}`);
  }

  _schema = {
    // tables
    tables: { saved: "saved_results", analysis: "analysis_results", diseases: hasDiseases ? "diseases" : null },

    // saved_results cols
    srId,
    srFolderId,
    srSavedAt,
    srUserId,
    srAnalysisFk,
    srImage,

    // analysis_results cols
    arPk,
    arPredictedKey,
    arConfidence,
    arCreatedAt,
    arVerified,
    arUserId,
    arImage,

    // diseases cols
    hasDiseases,
    dKey,
    dTitle,
    dDesc,
    dTips,
  };

  return _schema;
}

function userFilterClause(schema) {
  // якщо є user_id у saved_results — фільтруємо по ньому (найкраще)
  if (schema.srUserId) return { clause: `sr.${ident(schema.srUserId)} = $1`, usesUser: true };
  // якщо нема — пробуємо по analysis_results.user_id
  if (schema.arUserId) return { clause: `ar.${ident(schema.arUserId)} = $1`, usesUser: true };
  return { clause: "TRUE", usesUser: false };
}

function buildSelect(schema) {
  const sr = "sr";
  const ar = "ar";

  const imgExpr =
    schema.arImage
      ? `${ar}.${ident(schema.arImage)}`
      : schema.srImage
        ? `${sr}.${ident(schema.srImage)}`
        : "NULL";

  const diseaseExpr = schema.hasDiseases && schema.dKey
    ? `
      CASE WHEN d.${ident(schema.dKey)} IS NULL
        THEN NULL
        ELSE json_build_object(
          'key', d.${ident(schema.dKey)}
          ${schema.dTitle ? `, 'title', d.${ident(schema.dTitle)}` : ""}
          ${schema.dDesc ? `, 'description', d.${ident(schema.dDesc)}` : ""}
          ${schema.dTips ? `, 'tips', d.${ident(schema.dTips)}` : ""}
        )
      END
    `
    : "NULL";

  return `
    SELECT
      ${sr}.${ident(schema.srId)}             AS "savedId"
      ${schema.srFolderId ? `, ${sr}.${ident(schema.srFolderId)} AS "folderId"` : `, NULL AS "folderId"`}
      ${schema.srSavedAt ? `, ${sr}.${ident(schema.srSavedAt)}   AS "savedAt"` : `, NULL AS "savedAt"`}
      , ${ar}.${ident(schema.arPk)}          AS "analysisId"
      , ${ar}.${ident(schema.arPredictedKey)} AS "predictedKey"
      , ${ar}.${ident(schema.arConfidence)}  AS "confidence"
      ${schema.arCreatedAt ? `, ${ar}.${ident(schema.arCreatedAt)} AS "createdAt"` : `, NULL AS "createdAt"`}
      ${schema.arVerified ? `, ${ar}.${ident(schema.arVerified)} AS "verified"` : `, NULL AS "verified"`}
      , ${imgExpr}                            AS "imageUrl"
      , ${diseaseExpr}                        AS "disease"
    FROM public.${schema.tables.saved} ${sr}
    LEFT JOIN public.${schema.tables.analysis} ${ar}
      ON ${ar}.${ident(schema.arPk)} = ${sr}.${ident(schema.srAnalysisFk)}
    ${
      schema.hasDiseases && schema.dKey
        ? `LEFT JOIN public.${schema.tables.diseases} d ON d.${ident(schema.dKey)} = ${ar}.${ident(schema.arPredictedKey)}`
        : ""
    }
  `;
}

// ---------- GET /api/history ----------
export async function getHistoryAll(req, res) {
  try {
    const schema = await resolveSchema();
    const uf = userFilterClause(schema);

    const q = `
      ${buildSelect(schema)}
      WHERE ${uf.clause}
      ORDER BY ${schema.srSavedAt ? `sr.${ident(schema.srSavedAt)}` : `sr.${ident(schema.srId)}`} DESC
    `;

    const params = uf.usesUser ? [req.user?.id] : [];
    const r = await db.query(q, params);

    return res.json({ items: r.rows || [] });
  } catch (e) {
    console.error("getHistoryAll error:", e);
    return res.status(500).json({ message: "Помилка завантаження історії" });
  }
}

// ---------- GET /api/history/unassigned ----------
export async function getHistoryUnassigned(req, res) {
  try {
    const schema = await resolveSchema();
    const uf = userFilterClause(schema);

    const folderClause = schema.srFolderId ? `sr.${ident(schema.srFolderId)} IS NULL` : "TRUE";

    const q = `
      ${buildSelect(schema)}
      WHERE ${uf.clause} AND ${folderClause}
      ORDER BY ${schema.srSavedAt ? `sr.${ident(schema.srSavedAt)}` : `sr.${ident(schema.srId)}`} DESC
    `;

    const params = uf.usesUser ? [req.user?.id] : [];
    const r = await db.query(q, params);

    return res.json({ items: r.rows || [] });
  } catch (e) {
    console.error("getHistoryUnassigned error:", e);
    return res.status(500).json({ message: "Помилка завантаження історії" });
  }
}

// ---------- GET /api/history/folder/:id ----------
export async function getHistoryByFolder(req, res) {
  try {
    const schema = await resolveSchema();
    const uf = userFilterClause(schema);

    const folderId = Number(req.params.id);
    if (!Number.isFinite(folderId)) {
      return res.status(400).json({ message: "Некоректний folderId" });
    }

    if (!schema.srFolderId) {
      // якщо в saved_results немає folder_id — просто повернемо все
      return getHistoryAll(req, res);
    }

    const q = `
      ${buildSelect(schema)}
      WHERE ${uf.clause} AND sr.${ident(schema.srFolderId)} = ${uf.usesUser ? "$2" : "$1"}
      ORDER BY ${schema.srSavedAt ? `sr.${ident(schema.srSavedAt)}` : `sr.${ident(schema.srId)}`} DESC
    `;

    const params = uf.usesUser ? [req.user?.id, folderId] : [folderId];
    const r = await db.query(q, params);

    return res.json({ items: r.rows || [] });
  } catch (e) {
    console.error("getHistoryByFolder error:", e);
    return res.status(500).json({ message: "Помилка завантаження історії" });
  }
}

// ---------- PUT /api/history/:id  (move/update folder) ----------
export async function updateHistoryItem(req, res) {
  try {
    const schema = await resolveSchema();

    const savedId = Number(req.params.id);
    if (!Number.isFinite(savedId)) {
      return res.status(400).json({ message: "Некоректний id" });
    }

    const { folderId } = req.body || {};
    const newFolderId = folderId === null || folderId === undefined || folderId === "" ? null : Number(folderId);
    if (!(newFolderId === null || Number.isFinite(newFolderId))) {
      return res.status(400).json({ message: "Некоректний folderId" });
    }

    if (!schema.srFolderId) {
      return res.status(400).json({ message: "У БД немає folder_id у saved_results" });
    }

    // user scope якщо є
    const uf = userFilterClause(schema);
    const whereUser = uf.usesUser ? ` AND ${uf.clause.replaceAll("sr.", "")}` : "";

    // якщо uf по srUserId → clause "sr.user_id = $1", нам треба той самий saved_results
    // зробимо простіше: зберігаємо два варіанти
    let q, params;
    if (schema.srUserId) {
      q = `
        UPDATE public.${schema.tables.saved}
        SET ${ident(schema.srFolderId)} = $1
        WHERE ${ident(schema.srId)} = $2 AND ${ident(schema.srUserId)} = $3
        RETURNING ${ident(schema.srId)} AS "savedId", ${ident(schema.srFolderId)} AS "folderId"
      `;
      params = [newFolderId, savedId, req.user?.id];
    } else {
      q = `
        UPDATE public.${schema.tables.saved}
        SET ${ident(schema.srFolderId)} = $1
        WHERE ${ident(schema.srId)} = $2
        RETURNING ${ident(schema.srId)} AS "savedId", ${ident(schema.srFolderId)} AS "folderId"
      `;
      params = [newFolderId, savedId];
    }

    const r = await db.query(q, params);
    if (!r.rows?.length) return res.status(404).json({ message: "Запис не знайдено" });

    return res.json({ ok: true, item: r.rows[0] });
  } catch (e) {
    console.error("updateHistoryItem error:", e);
    return res.status(500).json({ message: "Помилка переміщення" });
  }
}

// alias під старі роутери (якщо десь імпортується moveHistoryItem)
export async function moveHistoryItem(req, res) {
  return updateHistoryItem(req, res);
}

// ---------- DELETE /api/history/:id ----------
export async function deleteHistoryItem(req, res) {
  try {
    const schema = await resolveSchema();

    const savedId = Number(req.params.id);
    if (!Number.isFinite(savedId)) {
      return res.status(400).json({ message: "Некоректний id" });
    }

    let q, params;
    if (schema.srUserId) {
      q = `
        DELETE FROM public.${schema.tables.saved}
        WHERE ${ident(schema.srId)} = $1 AND ${ident(schema.srUserId)} = $2
        RETURNING ${ident(schema.srId)} AS "savedId"
      `;
      params = [savedId, req.user?.id];
    } else {
      q = `
        DELETE FROM public.${schema.tables.saved}
        WHERE ${ident(schema.srId)} = $1
        RETURNING ${ident(schema.srId)} AS "savedId"
      `;
      params = [savedId];
    }

    const r = await db.query(q, params);
    if (!r.rows?.length) return res.status(404).json({ message: "Запис не знайдено" });

    return res.json({ ok: true, savedId: r.rows[0].savedId });
  } catch (e) {
    console.error("deleteHistoryItem error:", e);
    return res.status(500).json({ message: "Помилка видалення" });
  }
}
