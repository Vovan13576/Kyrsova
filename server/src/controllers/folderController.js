import db from "../config/db.js";
import { getHistorySchema } from "../utils/historySchema.js";

let folderSchemaCache = null;

function ident(name) {
  const s = String(name);
  return `"${s.replaceAll('"', '""')}"`;
}

async function getFolderSchema() {
  if (folderSchemaCache) return folderSchemaCache;

  const table = "folders";
  const t = await db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [table]
  );
  if (!t.rowCount) throw new Error("Table missing: folders");

  const c = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [table]
  );

  const map = new Map();
  for (const r of c.rows) map.set(String(r.column_name).toLowerCase(), r.column_name);

  const pick = (arr) => {
    for (const x of arr) {
      const real = map.get(String(x).toLowerCase());
      if (real) return real;
    }
    return null;
  };

  folderSchemaCache = {
    table,
    id: pick(["id"]),
    userId: pick(["user_id", "userid"]),
    name: pick(["name", "title"]),
    createdAt: pick(["created_at", "createdat"]),
  };

  if (!folderSchemaCache.id || !folderSchemaCache.name) {
    throw new Error("DB schema mismatch: folders.id/name not found");
  }

  return folderSchemaCache;
}

export async function getFolders(req, res) {
  try {
    const fs = await getFolderSchema();
    const hs = await getHistorySchema();

    const userId = req.user?.id;

    // folders list
    const params = [];
    let where = "";
    if (userId && fs.userId) {
      params.push(userId);
      where = `WHERE ${ident(fs.userId)} = $1`;
    }

    const foldersRes = await db.query(
      `SELECT ${ident(fs.id)} AS "id", ${ident(fs.name)} AS "name"
       FROM public.${ident(fs.table)}
       ${where}
       ORDER BY ${ident(fs.name)} ASC`,
      params
    );

    // counts from saved_results
    const srParams = [];
    let srWhere = "";
    if (userId && hs.saved.userId) {
      srParams.push(userId);
      srWhere = `WHERE ${hs.ident(hs.saved.userId)} = $1`;
    }

    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS "c"
       FROM public.${hs.ident(hs.tables.saved)}
       ${srWhere}`,
      srParams
    );

    const unassignedRes = await db.query(
      `SELECT COUNT(*)::int AS "c"
       FROM public.${hs.ident(hs.tables.saved)}
       ${srWhere ? srWhere + " AND" : "WHERE"} (${hs.ident(hs.saved.folderId)} IS NULL OR ${hs.ident(hs.saved.folderId)}=0)`,
      srParams
    );

    const perFolderRes = await db.query(
      `SELECT ${hs.ident(hs.saved.folderId)} AS "folderId", COUNT(*)::int AS "c"
       FROM public.${hs.ident(hs.tables.saved)}
       ${srWhere}
       GROUP BY ${hs.ident(hs.saved.folderId)}`,
      srParams
    );

    const mapCounts = new Map();
    for (const r of perFolderRes.rows) {
      if (r.folderId !== null && r.folderId !== undefined) mapCounts.set(String(r.folderId), r.c);
    }

    const items = foldersRes.rows.map((f) => ({
      id: f.id,
      name: f.name,
      itemsCount: mapCounts.get(String(f.id)) ?? 0,
    }));

    return res.json({
      items,
      totalCount: totalRes.rows[0]?.c ?? 0,
      unassignedCount: unassignedRes.rows[0]?.c ?? 0,
    });
  } catch (e) {
    console.error("getFolders error:", e);
    return res.status(500).json({ message: "Помилка папок" });
  }
}

export async function createFolder(req, res) {
  try {
    const fs = await getFolderSchema();
    const userId = req.user?.id;

    const name = String(req.body?.name || "").trim();
    if (name.length < 2) return res.status(400).json({ message: "Надто коротка назва" });

    const cols = [ident(fs.name)];
    const vals = ["$1"];
    const params = [name];

    if (userId && fs.userId) {
      cols.unshift(ident(fs.userId));
      vals.unshift("$2");
      params.push(userId);
    }

    const sql = `
      INSERT INTO public.${ident(fs.table)} (${cols.join(", ")})
      VALUES (${vals.join(", ")})
      RETURNING ${ident(fs.id)} AS "id", ${ident(fs.name)} AS "name"
    `;

    const r = await db.query(sql, params);
    return res.status(201).json({ item: r.rows[0] });
  } catch (e) {
    console.error("createFolder error:", e);
    return res.status(500).json({ message: "Не вдалося створити папку" });
  }
}

export async function renameFolder(req, res) {
  try {
    const fs = await getFolderSchema();
    const userId = req.user?.id;

    const id = Number(req.params.id);
    const name = String(req.body?.name || "").trim();

    if (!Number.isFinite(id)) return res.status(400).json({ message: "Некоректний id" });
    if (name.length < 2) return res.status(400).json({ message: "Некоректна назва" });

    const params = [name, id];
    let where = `WHERE ${ident(fs.id)} = $2`;

    if (userId && fs.userId) {
      params.push(userId);
      where += ` AND ${ident(fs.userId)} = $3`;
    }

    const r = await db.query(
      `UPDATE public.${ident(fs.table)}
       SET ${ident(fs.name)} = $1
       ${where}
       RETURNING ${ident(fs.id)} AS "id", ${ident(fs.name)} AS "name"`,
      params
    );

    if (!r.rowCount) return res.status(404).json({ message: "Папку не знайдено" });
    return res.json({ item: r.rows[0] });
  } catch (e) {
    console.error("renameFolder error:", e);
    return res.status(500).json({ message: "Не вдалося перейменувати" });
  }
}

export async function deleteFolder(req, res) {
  try {
    const fs = await getFolderSchema();
    const hs = await getHistorySchema();
    const userId = req.user?.id;

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Некоректний id" });

    // 1) відв’язуємо записи від папки
    const params1 = [id];
    let where1 = `WHERE ${hs.ident(hs.saved.folderId)} = $1`;
    if (userId && hs.saved.userId) {
      params1.push(userId);
      where1 += ` AND ${hs.ident(hs.saved.userId)} = $2`;
    }

    await db.query(
      `UPDATE public.${hs.ident(hs.tables.saved)}
       SET ${hs.ident(hs.saved.folderId)} = NULL
       ${where1}`,
      params1
    );

    // 2) видаляємо папку
    const params2 = [id];
    let where2 = `WHERE ${ident(fs.id)} = $1`;
    if (userId && fs.userId) {
      params2.push(userId);
      where2 += ` AND ${ident(fs.userId)} = $2`;
    }

    const r = await db.query(
      `DELETE FROM public.${ident(fs.table)}
       ${where2}`,
      params2
    );

    if (!r.rowCount) return res.status(404).json({ message: "Папку не знайдено" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("deleteFolder error:", e);
    return res.status(500).json({ message: "Не вдалося видалити папку" });
  }
}
