import pgPkg from "pg";
import fs from "fs";
import path from "path";

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

function safeInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

async function fetchHistory(whereSql, params) {
  const pool = getPool();

  // ✅ якщо таблиці diseases нема — просто повернемо без join (щоб не падало)
  const tryJoinDiseases = true;

  if (tryJoinDiseases) {
    try {
      const q = `
        SELECT
          ar.id, ar.user_id, ar.predicted_key, ar.confidence, ar.image_path,
          ar.verified, ar.folder_id, ar.created_at,
          d.title       AS disease_title,
          d.description AS disease_description,
          d.tips        AS disease_tips
        FROM public.analysis_results ar
        LEFT JOIN public.diseases d
          ON d.key = ar.predicted_key
        ${whereSql}
        ORDER BY ar.created_at DESC, ar.id DESC
      `;
      const r = await pool.query(q, params);
      return r.rows || [];
    } catch (e) {
      // fallback без diseases
      console.warn("History join diseases failed, fallback without diseases:", e?.message || e);
    }
  }

  const q2 = `
    SELECT
      id, user_id, predicted_key, confidence, image_path,
      verified, folder_id, created_at
    FROM public.analysis_results
    ${whereSql}
    ORDER BY created_at DESC, id DESC
  `;
  const r2 = await pool.query(q2, params);
  return r2.rows || [];
}

export async function getHistoryAll(req, res) {
  try {
    const userId = req.user?.id;
    const items = await fetchHistory(`WHERE ar.user_id = $1`, [userId]);
    return res.json({ ok: true, items });
  } catch (e) {
    console.error("getHistoryAll error:", e);
    return res.status(500).json({ ok: false, message: "History load failed", error: String(e?.message || e) });
  }
}

export async function getHistoryUnassigned(req, res) {
  try {
    const userId = req.user?.id;
    const items = await fetchHistory(`WHERE ar.user_id = $1 AND ar.folder_id IS NULL`, [userId]);
    return res.json({ ok: true, items });
  } catch (e) {
    console.error("getHistoryUnassigned error:", e);
    return res.status(500).json({ ok: false, message: "History load failed", error: String(e?.message || e) });
  }
}

export async function getHistoryByFolder(req, res) {
  try {
    const userId = req.user?.id;
    const folderId = safeInt(req.params.id);
    if (!folderId) return res.status(400).json({ ok: false, message: "Invalid folder id" });

    const items = await fetchHistory(`WHERE ar.user_id = $1 AND ar.folder_id = $2`, [userId, folderId]);
    return res.json({ ok: true, items });
  } catch (e) {
    console.error("getHistoryByFolder error:", e);
    return res.status(500).json({ ok: false, message: "History load failed", error: String(e?.message || e) });
  }
}

// body: { analysisId, folderId }  folderId може бути null -> прибрати з папки
export async function saveToHistory(req, res) {
  try {
    const userId = req.user?.id;
    const analysisId = safeInt(req.body?.analysisId);
    const folderIdRaw = req.body?.folderId;

    if (!analysisId) return res.status(400).json({ ok: false, message: "analysisId is required" });

    const folderId = folderIdRaw === null || folderIdRaw === undefined || folderIdRaw === "" ? null : safeInt(folderIdRaw);
    if (folderIdRaw !== null && folderIdRaw !== undefined && folderIdRaw !== "" && !folderId) {
      return res.status(400).json({ ok: false, message: "Invalid folderId" });
    }

    const pool = getPool();

    // ✅ оновлюємо folder_id прямо в analysis_results
    const q = `
      UPDATE public.analysis_results
      SET folder_id = $1
      WHERE id = $2 AND user_id = $3
      RETURNING id, folder_id
    `;
    const r = await pool.query(q, [folderId, analysisId, userId]);
    if (!r.rows?.length) return res.status(404).json({ ok: false, message: "Analysis not found" });

    // (необов’язково) підтримка folder_items, якщо в тебе вже десь воно використовується
    try {
      await pool.query(`DELETE FROM public.folder_items WHERE analysis_id = $1`, [analysisId]);
      if (folderId) {
        await pool.query(
          `INSERT INTO public.folder_items (folder_id, analysis_id, created_at)
           VALUES ($1, $2, NOW())`,
          [folderId, analysisId]
        );
      }
    } catch (e) {
      // якщо таблиці/колонки інші — просто не падаємо
      console.warn("folder_items update skipped:", e?.message || e);
    }

    return res.json({ ok: true, result: r.rows[0] });
  } catch (e) {
    console.error("saveToHistory error:", e);
    return res.status(500).json({ ok: false, message: "Save failed", error: String(e?.message || e) });
  }
}

// ✅ НОВЕ: DELETE /api/history/:id
export async function deleteHistoryItem(req, res) {
  const pool = getPool();
  const userId = req.user?.id;
  const id = safeInt(req.params.id);

  if (!id) return res.status(400).json({ ok: false, message: "Invalid id" });

  try {
    await pool.query("BEGIN");

    // беремо image_path щоб (опційно) видалити файл
    const pre = await pool.query(
      `SELECT id, image_path FROM public.analysis_results WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (!pre.rows?.length) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Analysis not found" });
    }
    const imagePath = pre.rows[0].image_path || "";

    // чистимо зв’язки (якщо існують)
    try {
      await pool.query(`DELETE FROM public.folder_items WHERE analysis_id = $1`, [id]);
    } catch {}

    try {
      await pool.query(`DELETE FROM public.saved_results WHERE analysis_result_id = $1`, [id]);
    } catch {}

    const del = await pool.query(
      `DELETE FROM public.analysis_results WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );

    await pool.query("COMMIT");

    // опційно: видаляємо файл з uploads
    try {
      if (typeof imagePath === "string" && imagePath.includes("uploads")) {
        const normalized = imagePath.replaceAll("\\", "/");
        const idx = normalized.lastIndexOf("/uploads/");
        if (idx !== -1) {
          const filename = normalized.slice(idx + "/uploads/".length);
          const abs = path.resolve(process.cwd(), "uploads", filename);
          if (fs.existsSync(abs)) fs.unlinkSync(abs);
        }
      }
    } catch {}

    return res.json({ ok: true, deletedId: del.rows?.[0]?.id || id });
  } catch (e) {
    try {
      await pool.query("ROLLBACK");
    } catch {}
    console.error("deleteHistoryItem error:", e);
    return res.status(500).json({ ok: false, message: "Delete failed", error: String(e?.message || e) });
  }
}
