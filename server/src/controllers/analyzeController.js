import fs from "fs";
import { spawn } from "child_process";
import pgPkg from "pg";

const { Pool } = pgPkg;

// ---- DB (під твою БД plantdb) ----
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

// ---- helpers ----
function splitPredictedKey(predictedKey) {
  if (!predictedKey || typeof predictedKey !== "string") {
    return { plantName: "Unknown", diseaseName: "Unknown", isHealthy: false };
  }

  const parts = predictedKey.split("___");
  const plantRaw = (parts[0] || "").trim();
  const diseaseRaw = (parts.slice(1).join("___") || "").trim();

  const plantName = plantRaw.replaceAll("_", " ").trim() || "Unknown";
  const diseaseName = diseaseRaw.replaceAll("_", " ").trim() || "Unknown";

  const isHealthy = /healthy/i.test(diseaseRaw) || /healthy/i.test(diseaseName);
  return { plantName, diseaseName, isHealthy };
}

/**
 * Запускає Python predict.py і очікує JSON у stdout.
 * Важливо: predict.py тепер може повертати ok:false (це НЕ помилка),
 * тому ми НЕ падаємо, якщо code=0 і JSON валідний.
 */
function runPythonPredict({ pythonPath, scriptPath, imagePath }) {
  return new Promise((resolve, reject) => {
    const args = ["-u", scriptPath, imagePath];
    const proc = spawn(pythonPath, args, { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    let err = "";

    proc.stdout.on("data", (d) => (out += d.toString("utf-8")));
    proc.stderr.on("data", (d) => (err += d.toString("utf-8")));

    proc.on("close", (code) => {
      const text = (out || "").trim();

      // Якщо python впав реально
      if (code !== 0) {
        return reject(new Error(`ML process exit code=${code}\n${err || text}`));
      }

      try {
        const json = JSON.parse(text);
        // Додаємо stderr як debug (не обов'язково, але іноді корисно)
        if (err && !json._stderr) json._stderr = err;
        resolve(json);
      } catch (e) {
        reject(
          new Error(`ML output is not JSON.\nstdout:\n${text}\nstderr:\n${err}`)
        );
      }
    });
  });
}

// ✅ дістаємо description/tips з таблиці diseases (різні можливі назви колонок)
async function fetchDiseaseInfo(pool, predictedKey) {
  if (!predictedKey) return null;

  const attempts = [
    { sql: `SELECT title, description, tips FROM public.diseases WHERE key = $1 LIMIT 1`, map: (r) => r },
    { sql: `SELECT title, description, tips FROM public.diseases WHERE predicted_key = $1 LIMIT 1`, map: (r) => r },
    { sql: `SELECT title, description, recommendations AS tips FROM public.diseases WHERE key = $1 LIMIT 1`, map: (r) => r },
    { sql: `SELECT title, description, recommendations AS tips FROM public.diseases WHERE predicted_key = $1 LIMIT 1`, map: (r) => r },
    { sql: `SELECT name AS title, description, tips FROM public.diseases WHERE key = $1 LIMIT 1`, map: (r) => r },
    { sql: `SELECT name AS title, description, recommendations AS tips FROM public.diseases WHERE predicted_key = $1 LIMIT 1`, map: (r) => r },
  ];

  for (const a of attempts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await pool.query(a.sql, [predictedKey]);
      if (r.rows && r.rows.length) {
        const row = a.map(r.rows[0]);
        return {
          title: row.title || "",
          description: row.description || "",
          tips: row.tips || "",
        };
      }
    } catch {
      // якщо колонки не існують — пробуємо наступний варіант
    }
  }

  return null;
}

// =========================
// POST /api/analyze
// =========================
export async function analyzePlant(req, res) {
  try {
    if (!req.file?.path) {
      return res.status(400).json({ ok: false, message: "No image uploaded (field name: image)" });
    }

    const pythonPath =
      process.env.PYTHON_PATH || "C:/Kyrsova/plant-disease-web/ml/.venv/Scripts/python.exe";

    const scriptPath =
      process.env.ML_PREDICT_PATH || "C:/Kyrsova/plant-disease-web/ml/predict.py";

    const imagePath = req.file.path;

    if (!fs.existsSync(pythonPath)) {
      return res.status(500).json({
        ok: false,
        message: "Python path not found",
        error: pythonPath,
      });
    }
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({
        ok: false,
        message: "predict.py not found",
        error: scriptPath,
      });
    }

    const ml = await runPythonPredict({ pythonPath, scriptPath, imagePath });

    // ✅ НОВЕ: якщо ML каже "це не рослина" або інша причина — просто повертаємо
    // (і НЕ записуємо як валідний аналіз хвороби)
    if (ml && ml.ok === false) {
      return res.json({
        ok: false,
        reason: ml.reason || "ml_rejected",
        message: ml.message || "Модель відхилила зображення.",
        plant_score: ml.plant_score ?? null,
        best_clip_label: ml.best_clip_label ?? null,
        best_clip_score: ml.best_clip_score ?? null,
        raw: ml,
        image_path: imagePath,
      });
    }

    const predictedKey = ml?.predicted_key ?? ml?.predictedKey ?? ml?.key ?? null;
    const confidenceRaw = ml?.confidence ?? ml?.score ?? ml?.prob ?? null;
    const confidence = confidenceRaw === null ? null : Number(confidenceRaw);

    // ✅ НОВЕ: якщо раптом predictedKey порожній — теж м’яко повернемо
    if (!predictedKey) {
      return res.json({
        ok: false,
        reason: "no_prediction",
        message: "Не вдалося отримати прогноз від моделі.",
        raw: ml,
        image_path: imagePath,
      });
    }

    const { plantName, diseaseName, isHealthy } = splitPredictedKey(predictedKey);
    const userId = req.user?.id ?? null;

    let analysisId = null;
    try {
      const pool = getPool();
      const q = `
        INSERT INTO public.analysis_results
          (user_id, predicted_key, confidence, image_path, verified, folder_id, created_at)
        VALUES
          ($1, $2, $3, $4, false, NULL, NOW())
        RETURNING id
      `;
      const r = await pool.query(q, [userId, predictedKey, confidence, imagePath]);
      analysisId = r.rows?.[0]?.id ?? null;
    } catch (dbErr) {
      console.error("DB insert analysis_results error:", dbErr);
    }

    // ✅ підтягуємо опис/рекомендації
    let disease = null;
    try {
      const pool = getPool();
      disease = await fetchDiseaseInfo(pool, predictedKey);
    } catch {
      disease = null;
    }

    return res.json({
      ok: true,
      analysisId,
      predictedKey,
      confidence,
      plantName,
      diseaseName,
      isHealthy,
      disease,
      raw: ml,
      image_path: imagePath,
    });
  } catch (e) {
    console.error("analyze error:", e);
    return res.status(500).json({
      ok: false,
      message: "ML processing failed",
      error: String(e?.message || e),
    });
  }
}

// =========================
// POST /api/analyze/:id/verify
// body (опц.): { verified } або { analysisId, verified }
// =========================
export async function verifyAnalysis(req, res) {
  try {
    const body = req.body || {};
    const analysisId = body.analysisId || req.params?.id;
    const verified = body.verified;

    if (!analysisId) {
      return res.status(400).json({ ok: false, message: "analysisId is required" });
    }

    const v = !!verified;

    const pool = getPool();
    const q = `
      UPDATE public.analysis_results
      SET verified = $2,
          verified_at = CASE WHEN $2 = true THEN NOW() ELSE NULL END
      WHERE id = $1
      RETURNING id, verified, verified_at
    `;
    const r = await pool.query(q, [analysisId, v]);

    if (!r.rows?.length) {
      return res.status(404).json({ ok: false, message: "analysis_result not found" });
    }

    return res.json({ ok: true, result: r.rows[0] });
  } catch (e) {
    console.error("verifyAnalysis error:", e);
    return res.status(500).json({ ok: false, message: "Verify failed", error: String(e?.message || e) });
  }
}
