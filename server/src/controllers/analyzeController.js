import fs from "fs";
import path from "path";
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

function runPythonPredict({ pythonPath, scriptPath, imagePath }) {
  return new Promise((resolve, reject) => {
    const args = ["-u", scriptPath, imagePath];
    const proc = spawn(pythonPath, args, { stdio: ["ignore", "pipe", "pipe"] });

    let out = "";
    let err = "";

    proc.stdout.on("data", (d) => (out += d.toString("utf-8")));
    proc.stderr.on("data", (d) => (err += d.toString("utf-8")));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ML process exit code=${code}\n${err || out}`));
      }

      const text = out.trim();
      try {
        const json = JSON.parse(text);
        resolve(json);
      } catch (e) {
        reject(
          new Error(
            `ML output is not JSON.\nstdout:\n${text}\nstderr:\n${err}`
          )
        );
      }
    });
  });
}

async function findDiseaseByKey(predictedKey) {
  if (!predictedKey) return null;
  const pool = getPool();

  // спочатку точний збіг
  const q1 = `
    SELECT id, key, title, description, tips
    FROM public.diseases
    WHERE key = $1
    LIMIT 1
  `;
  const r1 = await pool.query(q1, [predictedKey]);
  if (r1.rows?.length) return r1.rows[0];

  // на всяк випадок — нечутливо до регістру
  const q2 = `
    SELECT id, key, title, description, tips
    FROM public.diseases
    WHERE lower(key) = lower($1)
    LIMIT 1
  `;
  const r2 = await pool.query(q2, [predictedKey]);
  if (r2.rows?.length) return r2.rows[0];

  return null;
}

// =========================
// POST /api/analyze
// =========================
export async function analyzePlant(req, res) {
  try {
    if (!req.file?.path) {
      return res
        .status(400)
        .json({ ok: false, message: "No image uploaded (field name: image)" });
    }

    const pythonPath =
      process.env.PYTHON_PATH ||
      "C:/Kyrsova/plant-disease-web/ml/.venv/Scripts/python.exe";

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

    const predictedKey = ml.predicted_key ?? ml.predictedKey ?? ml.key ?? null;
    const confidenceRaw = ml.confidence ?? ml.score ?? ml.prob ?? null;
    const confidence = confidenceRaw === null ? null : Number(confidenceRaw);

    const { plantName, diseaseName, isHealthy } = splitPredictedKey(predictedKey);

    // ✅ ВАЖЛИВО: підтягуємо опис і поради з БД
    let disease = null;
    try {
      disease = await findDiseaseByKey(predictedKey);
    } catch (e) {
      console.warn("Disease lookup error:", e?.message || e);
    }

    // optionalAuthMiddleware може підставити req.user
    const userId = req.user?.id ?? null;

    // ✅ Зберігаємо результат в analysis_results
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

    // ✅ Повертаємо description/tips так, як фронт очікує
    return res.json({
      ok: true,
      analysisId,
      predictedKey,
      confidence,
      plantName,
      diseaseName,
      isHealthy,

      // ВАЖЛИВО ДЛЯ Analyze.jsx:
      description: disease?.description ?? null,
      tips: disease?.tips ?? null,
      diseaseTitle: disease?.title ?? null,
      diseaseId: disease?.id ?? null,

      raw: ml,
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
// =========================
export async function verifyAnalysis(req, res) {
  try {
    const { analysisId, verified } = req.body || {};

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
    return res.status(500).json({
      ok: false,
      message: "Verify failed",
      error: String(e?.message || e),
    });
  }
}
