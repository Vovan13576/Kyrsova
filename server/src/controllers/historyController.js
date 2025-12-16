import fs from "fs";
import path from "path";
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

// ---------- Helpers: safe columns detection ----------
let _diseasesCols = null;
let _analysisCols = null;

async function getTableColumns(pool, tableName) {
  const q = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `;
  const r = await pool.query(q, [tableName]);
  return new Set((r.rows || []).map((x) => x.column_name));
}

async function getDiseasesCols(pool) {
  if (_diseasesCols) return _diseasesCols;
  try {
    _diseasesCols = await getTableColumns(pool, "diseases");
  } catch {
    _diseasesCols = new Set();
  }
  return _diseasesCols;
}

async function getAnalysisCols(pool) {
  if (_analysisCols) return _analysisCols;
  try {
    _analysisCols = await getTableColumns(pool, "analysis_results");
  } catch {
    _analysisCols = new Set();
  }
  return _analysisCols;
}

function pickFirstExisting(colsSet, candidates) {
  for (const c of candidates) if (colsSet.has(c)) return c;
  return null;
}

async function buildHistoryQuery(pool, whereSql) {
  const diseasesCols = await getDiseasesCols(pool);

  const keyCol = pickFirstExisting(diseasesCols, ["predicted_key", "key", "disease_key"]);
  const titleCol = pickFirstExisting(diseasesCols, ["disease_title", "title", "name"]);
  const descCol = pickFirstExisting(diseasesCols, ["disease_description", "description", "desc"]);
  const tipsCol = pickFirstExisting(diseasesCols, ["disease_tips", "tips", "recommendations", "recommendation"]);

  const baseSelect = `
    SELECT
      ar.id,
      ar.user_id,
      ar.predicted_key,
      ar.confidence,
      ar.image_path,
      ar.verified,
      ar.folder_id,
      ar.created_at
  `;

  // якщо diseases таблиця/колонки є — робимо join, якщо ні — повертаємо NULL-и
  if (keyCol) {
    const sql = `
      ${baseSelect},
      ${titleCol ? `d.${titleCol}` : `NULL::text`} AS disease_title,
      ${descCol ? `d.${descCol}` : `NULL::text`} AS disease_description,
      ${tipsCol ? `d.${tipsCol}` : `NULL::text`} AS disease_tips
      FROM public.analysis_results ar
      LEFT JOIN public.diseases d
        ON d.${keyCol} = ar.predicted_key
      ${whereSql}
      ORDER BY ar.created_at DESC NULLS LAST, ar.id DESC
    `;
    return sql;
  }

  const sql = `
    ${baseSelect},
      NULL::text AS disease_title,
      NULL::text AS disease_description,
      NULL::text AS disease_tips
    FROM public.analysis_results ar
    ${whereSql}
    ORDER BY ar.created_at DESC NULLS LAST, ar.id DESC
  `;
  return sql;
}

async function fetchHistory(req, res, whereSql, params) {
  try {
    const pool = getPool();
    const sql = await buildHistoryQuery(pool, whereSql);
    const r = await pool.query(sql, params);
    return res.json({ items: r.rows || [] });
  } catch (e) {
    console.error("history fetch error:", e);
    return res
      .status(500)
      .json({ ok: false, message: "History fetch failed", error: String(e?.message || e) });
  }
}

// ---------- GET ----------
export async function getHistoryAll(req, res) {
  const userId = req.user?.id;
  return fetchHistory(req, res, `WHERE ar.user_id = $1`, [userId]);
}

export async function getHistoryUnassigned(req, res) {
  const userId = req.user?.id;
  return fetchHistory(req, res, `WHERE ar.user_id = $1 AND ar.folder_id IS NULL`, [userId]);
}

export async function getHistoryByFolder(req, res) {
  const userId = req.user?.id;
  const folderId = Number(req.params.id);
  if (!folderId) return res.status(400).json({ ok: false, message: "Invalid folder id" });

  return fetchHistory(req, res, `WHERE ar.user_id = $1 AND ar.folder_id = $2`, [userId, folderId]);
}

// ---------- POST /history/save ----------
// body: { analysisId, folderId? }
// робить verified=true і (за потреби) прив’язує до папки
export async function saveToHistory(req, res) {
  try {
    const userId = req.user?.id;
    const { analysisId, folderId } = req.body || {};
    const id = Number(analysisId);
    if (!id) return res.status(400).json({ ok: false, message: "analysisId is required" });

    const pool = getPool();

    // folderId: null/"" => без папки
    let fId = folderId === null || folderId === undefined || folderId === "" ? null : Number(folderId);
    if (fId !== null && !Number.isFinite(fId)) fId = null;

    // якщо folder задано — перевіримо що він належить юзеру
    if (fId !== null) {
      const fr = await pool.query(`SELECT id FROM public.folders WHERE id = $1 AND user_id = $2`, [fId, userId]);
      if (!fr.rows?.length) return res.status(404).json({ ok: false, message: "Folder not found" });
    }

    const aCols = await getAnalysisCols(pool);
    const hasVerifiedAt = aCols.has("verified_at");
    const verifiedAtSql = hasVerifiedAt ? ", verified_at = NOW()" : "";

    const q = `
      UPDATE public.analysis_results
      SET
        user_id = $1,
        folder_id = $2,
        verified = true
        ${verifiedAtSql}
      WHERE id = $3
        AND (user_id IS NULL OR user_id = $1)
      RETURNING id, verified, folder_id
    `;
    const r = await pool.query(q, [userId, fId, id]);

    if (!r.rows?.length) {
      return res.status(404).json({ ok: false, message: "Analysis not found or not allowed" });
    }

    return res.json({ ok: true, result: r.rows[0] });
  } catch (e) {
    console.error("saveToHistory error:", e);
    return res.status(500).json({ ok: false, message: "Save failed", error: String(e?.message || e) });
  }
}

// ---------- PUT /history/:id/folder ----------
// body: { folderId: number|null }
export async function moveHistoryToFolder(req, res) {
  try {
    const userId = req.user?.id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: "Invalid analysis id" });

    const { folderId } = req.body || {};
    const pool = getPool();

    let fId = folderId === null || folderId === undefined || folderId === "" ? null : Number(folderId);
    if (fId !== null && !Number.isFinite(fId)) fId = null;

    if (fId !== null) {
      const fr = await pool.query(`SELECT id FROM public.folders WHERE id = $1 AND user_id = $2`, [fId, userId]);
      if (!fr.rows?.length) return res.status(404).json({ ok: false, message: "Folder not found" });
    }

    const r = await pool.query(
      `
      UPDATE public.analysis_results
      SET folder_id = $2
      WHERE id = $1 AND user_id = $3
      RETURNING id, folder_id
      `,
      [id, fId, userId]
    );

    if (!r.rows?.length) return res.status(404).json({ ok: false, message: "Analysis not found" });

    return res.json({ ok: true, result: r.rows[0] });
  } catch (e) {
    console.error("moveHistoryToFolder error:", e);
    return res.status(500).json({ ok: false, message: "Move failed", error: String(e?.message || e) });
  }
}

// ---------- DELETE /history/:id ----------
export async function deleteHistoryItem(req, res) {
  try {
    const userId = req.user?.id;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: "Invalid analysis id" });

    const pool = getPool();

    // знайдемо image_path щоб (опційно) стерти файл
    const rr = await pool.query(
      `SELECT image_path FROM public.analysis_results WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!rr.rows?.length) return res.status(404).json({ ok: false, message: "Analysis not found" });

    const imagePath = rr.rows[0]?.image_path || "";

    await pool.query(`DELETE FROM public.analysis_results WHERE id = $1 AND user_id = $2`, [id, userId]);

    // best-effort: видалити файл, якщо це uploads
    try {
      if (imagePath) {
        const normalized = String(imagePath).replaceAll("\\", "/");
        const idx = normalized.lastIndexOf("/uploads/");
        if (idx !== -1) {
          const rel = normalized.slice(idx + 1); // "uploads/xxx"
          const abs = path.resolve(process.cwd(), rel);
          if (fs.existsSync(abs)) fs.unlinkSync(abs);
        }
      }
    } catch (e2) {
      console.warn("file delete skipped:", e2?.message || e2);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("deleteHistoryItem error:", e);
    return res.status(500).json({ ok: false, message: "Delete failed", error: String(e?.message || e) });
  }
}
