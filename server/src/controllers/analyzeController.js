import { execFile } from "child_process";
import db from "../config/db.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ бери з env, або дефолт (твій шлях)
const PYTHON_PATH =
  process.env.PYTHON_PATH || "C:/Kyrsova/plant-disease-web/ml/.venv/Scripts/python.exe";

const ML_SCRIPT_PATH =
  process.env.ML_SCRIPT_PATH || path.resolve(__dirname, "../../../ml/predict.py");

// таймаут щоб не “висіло вічно”
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 240000); // 4 хв

function safeParseJson(stdout) {
  const text = (stdout || "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const jsonStr = text.slice(first, last + 1);
  return JSON.parse(jsonStr);
}

function splitKey(key) {
  if (!key || typeof key !== "string") {
    return { plantName: null, diseaseName: null, isHealthy: false };
  }
  const parts = key.split("___");
  const plantRaw = parts[0] || "";
  const diseaseRaw = parts[1] || "";
  const plantName = plantRaw.replaceAll("_", " ").trim();
  const diseaseName = diseaseRaw.replaceAll("_", " ").trim();
  const isHealthy = diseaseName.toLowerCase() === "healthy";
  return { plantName, diseaseName, isHealthy };
}

// POST /api/analyze
export const analyzePlant = async (req, res) => {
  try {
    if (!req.file?.path) return res.status(400).json({ error: "No image uploaded" });

    const imageAbsPath = path.resolve(req.file.path);
    const imageFilename = req.file.filename;

    console.log("▶ Python:", PYTHON_PATH);
    console.log("▶ Script:", ML_SCRIPT_PATH);
    console.log("▶ Image:", imageAbsPath);

    execFile(
      PYTHON_PATH,
      [ML_SCRIPT_PATH, imageAbsPath],
      { timeout: ML_TIMEOUT_MS },
      async (error, stdout, stderr) => {
        try {
          if (error) {
            console.error("❌ Python exec error:", error?.message || error);
            if (stderr) console.error("STDERR:\n", String(stderr));
            return res.status(500).json({ error: "ML processing failed", details: String(stderr || error?.message || "") });
          }

          let result;
          try {
            result = safeParseJson(stdout);
          } catch (e) {
            console.error("❌ JSON parse error:", e?.message);
            console.error("STDOUT was:\n", stdout);
            if (stderr) console.error("STDERR:\n", stderr);
            return res.status(500).json({ error: "Bad ML output (not JSON)" });
          }

          if (!result) {
            console.error("❌ Empty/invalid ML JSON");
            console.error("STDOUT was:\n", stdout);
            return res.status(500).json({ error: "Empty ML result" });
          }

          if (result.error) return res.status(500).json({ error: result.error });

          // якщо листок не знайдено — не пишемо в БД
          if (result.plant_detected === false) {
            return res.status(200).json({
              plant_detected: false,
              unsure: true,
              message:
                result.message ||
                "Рослину/листок не знайдено. Піднеси листок ближче до камери і розмісти по центру.",
              plant_ratio: result.plant_ratio ?? null,
            });
          }

          const predictedKey = result.predictedKey ?? null;
          const confidence = Number(result.confidence);

          // якщо модель “не впевнена” — теж не пишемо
          if (!predictedKey || !Number.isFinite(confidence)) {
            return res.status(200).json({
              plant_detected: true,
              unsure: true,
              message: "Не вдалося впевнено визначити клас. Спробуй інше фото (краще світло, без розмиття).",
              predictedKey,
              confidence: Number.isFinite(confidence) ? confidence : null,
              top: result.top ?? [],
            });
          }

          const userId = req.user?.id || 1;

          const inserted = await db.query(
            `
              INSERT INTO public.analysis_results (user_id, predicted_key, confidence, image_path, verified)
              VALUES ($1, $2, $3, $4, false)
              RETURNING id, created_at
            `,
            [userId, predictedKey, confidence, imageFilename]
          );

          const analysisId = inserted.rows?.[0]?.id ?? null;

          const diseaseRes = await db.query(`SELECT * FROM public.diseases WHERE key = $1 LIMIT 1`, [predictedKey]);
          const diseaseRow = diseaseRes.rows?.[0] || null;

          const { plantName, diseaseName, isHealthy } = splitKey(predictedKey);

          return res.json({
            plant_detected: true,
            unsure: Boolean(result.unsure),
            analysisId,
            verified: false,
            predictedKey,
            confidence,
            plantName,
            diseaseName,
            isHealthy,
            top: result.top ?? [],
            imageUrl: `/uploads/${imageFilename}`,
            disease: diseaseRow
              ? diseaseRow
              : {
                  key: predictedKey,
                  title: predictedKey,
                  description: "Опис відсутній у базі.",
                  tips: "Рекомендації відсутні у базі.",
                },
          });
        } catch (innerErr) {
          console.error("❌ analyze callback error:", innerErr);
          return res.status(500).json({ error: "Server error in analyze callback" });
        }
      }
    );
  } catch (err) {
    console.error("❌ analyzePlant error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// POST /api/analyze/:id/verify
export const verifyAnalysis = async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const updated = await db.query(
      `
        UPDATE public.analysis_results
        SET verified = true, verified_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING id, verified
      `,
      [id, userId]
    );

    if (updated.rowCount === 0) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true, id, verified: true });
  } catch (e) {
    console.error("❌ verifyAnalysis error:", e);
    return res.status(500).json({ error: "Failed to verify" });
  }
};
