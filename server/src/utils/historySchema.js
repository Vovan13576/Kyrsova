import db from "../config/db.js";

let cached = null;

function ident(name) {
  const s = String(name);
  return `"${s.replaceAll('"', '""')}"`;
}

async function tableExists(tableName) {
  const r = await db.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema='public' AND table_name=$1
     LIMIT 1`,
    [tableName]
  );
  return r.rowCount > 0;
}

async function getColumnsMap(tableName) {
  const r = await db.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1`,
    [tableName]
  );

  const map = new Map(); // lower -> real
  for (const row of r.rows) {
    map.set(String(row.column_name).toLowerCase(), row.column_name);
  }
  return map;
}

function pickCol(colsMap, candidates) {
  for (const c of candidates) {
    const real = colsMap.get(String(c).toLowerCase());
    if (real) return real;
  }
  return null;
}

export async function getHistorySchema() {
  if (cached) return cached;

  const savedTable = "saved_results";
  const analysisTable = "analysis_results";
  const foldersTable = "folders";
  const diseasesTable = "diseases";

  if (!(await tableExists(savedTable))) throw new Error(`Table missing: ${savedTable}`);
  if (!(await tableExists(analysisTable))) throw new Error(`Table missing: ${analysisTable}`);

  const srCols = await getColumnsMap(savedTable);
  const arCols = await getColumnsMap(analysisTable);

  const schema = {
    ident,
    tables: {
      saved: savedTable,
      analysis: analysisTable,
      folders: (await tableExists(foldersTable)) ? foldersTable : null,
      diseases: (await tableExists(diseasesTable)) ? diseasesTable : null,
    },
    saved: {
      id: pickCol(srCols, ["id", "saved_id", "savedid"]),
      userId: pickCol(srCols, ["user_id", "userid"]),
      folderId: pickCol(srCols, ["folder_id", "folderid", "folder"]),
      analysisId: pickCol(srCols, ["analysis_id", "analysisid", "analysis"]),
      savedAt: pickCol(srCols, ["saved_at", "savedat", "created_at", "createdat"]),
      imageUrl: pickCol(srCols, ["image_url", "imageurl", "file_url", "fileurl", "path"]),
    },
    analysis: {
      id: pickCol(arCols, ["id"]),
      userId: pickCol(arCols, ["user_id", "userid"]),
      predictedKey: pickCol(arCols, ["predicted_key", "predictedkey", "predicted"]),
      confidence: pickCol(arCols, ["confidence", "probability", "score"]),
      createdAt: pickCol(arCols, ["created_at", "createdat"]),
      verified: pickCol(arCols, ["verified", "is_verified", "isverified"]),
      imageUrl: pickCol(arCols, ["image_url", "imageurl", "file_url", "fileurl", "path"]),
      diseaseTitle: pickCol(arCols, ["disease_title", "diseasetitle", "title"]),
      diseaseDescription: pickCol(arCols, ["disease_description", "diseasedescription", "description"]),
      diseaseTips: pickCol(arCols, ["disease_tips", "diseasetips", "tips"]),
    },
  };

  // мінімально необхідні колонки
  if (!schema.saved.id) throw new Error("DB schema mismatch: saved_results.id not found");
  if (!schema.saved.folderId) throw new Error("DB schema mismatch: saved_results.folder_id not found");
  if (!schema.saved.analysisId) throw new Error("DB schema mismatch: saved_results.analysis_id (or analysisId) not found");
  if (!schema.analysis.id) throw new Error("DB schema mismatch: analysis_results.id not found");

  cached = schema;
  return schema;
}
