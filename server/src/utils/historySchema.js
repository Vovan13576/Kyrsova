// server/src/utils/historySchema.js
import db from "../config/db.js";

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

/**
 * ЦЕЙ schema використовується folderController-ом.
 * У твоїй БД:
 * saved_results має analysis_result_id (НЕ analysis_id)
 * analysis_results має id, predicted_key, confidence, image_path, verified, folder_id, verified_at ...
 */
export async function getHistorySchema() {
  if (_schema) return _schema;

  // required tables
  if (!(await tableExists("saved_results"))) {
    throw new Error("DB schema mismatch: missing table public.saved_results");
  }
  if (!(await tableExists("analysis_results"))) {
    throw new Error("DB schema mismatch: missing table public.analysis_results");
  }

  const savedCols = await getColumns("saved_results");
  const analysisCols = await getColumns("analysis_results");

  // saved_results
  const srId = firstExisting(savedCols, ["id", "saved_id", "savedid"]);
  const srUserId = firstExisting(savedCols, ["user_id", "userid"]);
  const srFolderId = firstExisting(savedCols, ["folder_id", "folderid"]);
  const srSavedAt = firstExisting(savedCols, ["saved_at", "savedat", "created_at"]);
  // ✅ головне виправлення — під твою БД
  const srAnalysisFk = firstExisting(savedCols, [
    "analysis_result_id", // ✅ у тебе так
    "analysis_results_id",
    "analysis_id",
    "analysisid",
  ]);

  // analysis_results
  const arId = firstExisting(analysisCols, ["id", "analysis_id", "analysisid"]);
  const arUserId = firstExisting(analysisCols, ["user_id", "userid"]);
  const arPredictedKey = firstExisting(analysisCols, ["predicted_key", "predictedkey"]);
  const arConfidence = firstExisting(analysisCols, ["confidence", "probability", "score"]);
  const arCreatedAt = firstExisting(analysisCols, ["created_at", "createdat"]);
  const arImagePath = firstExisting(analysisCols, ["image_path", "image", "image_url", "path", "file_path"]);
  const arVerified = firstExisting(analysisCols, ["verified", "is_verified", "isverified"]);
  const arFolderId = firstExisting(analysisCols, ["folder_id", "folderid"]);
  const arVerifiedAt = firstExisting(analysisCols, ["verified_at", "verifiedat"]);

  // diseases (optional)
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

  const missing = [];
  if (!srId) missing.push("saved_results.id");
  if (!srAnalysisFk) missing.push("saved_results.analysis_result_id");
  if (!arId) missing.push("analysis_results.id");
  if (!arPredictedKey) missing.push("analysis_results.predicted_key");
  if (!arConfidence) missing.push("analysis_results.confidence");

  if (missing.length) {
    throw new Error(`DB schema mismatch: missing columns: ${missing.join(", ")}`);
  }

  _schema = {
    ident,
    tables: {
      saved: "saved_results",
      analysis: "analysis_results",
      diseases: hasDiseases ? "diseases" : null,
    },
    saved: {
      id: srId,
      userId: srUserId,
      folderId: srFolderId,
      savedAt: srSavedAt,
      analysisId: srAnalysisFk, // ✅ вказує на analysis_results.id через analysis_result_id
    },
    analysis: {
      id: arId,
      userId: arUserId,
      predictedKey: arPredictedKey,
      confidence: arConfidence,
      createdAt: arCreatedAt,
      imagePath: arImagePath,
      verified: arVerified,
      folderId: arFolderId,
      verifiedAt: arVerifiedAt,
    },
    diseases: hasDiseases
      ? { key: dKey, title: dTitle, description: dDesc, tips: dTips }
      : null,
  };

  return _schema;
}
