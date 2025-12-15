import { execFile } from "child_process";
import db from "../config/db.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Можеш задати в server/.env:
// PYTHON_PATH=C:/Kyrsova/plant-disease-web/ml/.venv/Scripts/python.exe
// ML_SCRIPT_PATH=C:/Kyrsova/plant-disease-web/ml/predict.py
const PYTHON_PATH =
  process.env.PYTHON_PATH || "C:/Kyrsova/plant-disease-web/ml/.venv/Scripts/python.exe";

const ML_SCRIPT_PATH =
  process.env.ML_SCRIPT_PATH || path.resolve(__dirname, "../../../ml/predict.py");

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

// POST /api/analyze  (⚠️ без auth — щоб аналіз працював навіть без логіну)
export const analyzePlant = async (req, res) => {
  try {
    if (!req.file?.path) return res.status(400).json({ message: "No image uploaded" });

    const imagePath = path.resolve(req.file.path);
    const imageFilename = req.file.filename;

    console.log("▶ Image path:", imagePath);
    console.log("▶ ML script:", ML_SCRIPT_PATH);

    execFile(PYTHON_PATH, [ML_SCRIPT_PATH, imagePath], async (error, stdout, stderr) => {
      try {
        if (error) {
          console.error("❌ Python error:", error);
          if (stderr) console.error("STDERR:\n", stderr);
          return res.status(500).json({ message: "ML processing failed" });
        }

        let result;
        try {
          result = safeParseJson(stdout);
        } catch (e) {
          console.error("❌ JSON parse error:", e?.message);
          console.error("STDOUT was:\n", stdout);
          if (stderr) console.error("STDERR:\n", stderr);
          return res.status(500).json({ message: "Bad ML output (not JSON)" });
        }

        if (!result) {
          console.error("❌ Empty/invalid ML JSON");
          console.error("STDOUT was:\n", stdout);
          if (stderr) console.error("STDERR:\n", stderr);
          return res.status(500).json({ message: "Empty ML result" });
        }

        if (result.error) return res.status(500).json({ message: result.error });

        // якщо листок не знайдено — НЕ пишемо в БД
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

        // якщо не впевнено — НЕ пишемо в БД
        if (!predictedKey || !Number.isFinite(confidence)) {
          return res.status(200).json({
            plant_detected: true,
            unsure: true,
            message:
              "Не вдалося впевнено визначити клас. Спробуй інше фото (краще світло, без розмиття).",
            predictedKey,
            confidence: Number.isFinite(confidence) ? confidence : null,
            top: result.top ?? [],
          });
        }

        // якщо логіну нема — пишемо під user_id=1 (щоб демо працювало завжди)
        const userId = req.user?.id || 1;

        const inserted = await db.query(
          `
          INSERT INTO public.analysis_results (user_id, predicted_key, confidence, image_path, verified)
          VALUES ($1, $2, $3, $4, false)
          RETURNING id, created_at
          `,
          [userId, predictedKey, confidence, imageFilename]
        );

        const analysisId = inserted.rows[0]?.id ?? null;

        const diseaseRes = await db.query(
          `SELECT * FROM public.diseases WHERE key = $1 LIMIT 1`,
          [predictedKey]
        );

        const diseaseRow = diseaseRes.rows[0] || null;
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
        console.error("❌ analyzePlant callback error:", innerErr);
        return res.status(500).json({ message: "Server error in analyze callback" });
      }
    });
  } catch (err) {
    console.error("❌ analyzePlant error:", err);
    return res.status(500).json({ message: err.message || "Analyze failed" });
  }
};

// POST /api/analyze/:id/verify  (позначити як перевірене) — вже під auth
export const verifyAnalysis = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Неавторизовано" });

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Bad id" });

    const updated = await db.query(
      `
      UPDATE public.analysis_results
      SET verified = true, verified_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, verified
      `,
      [id, userId]
    );

    if (updated.rowCount === 0) return res.status(404).json({ message: "Not found" });

    return res.json({ ok: true, id, verified: true });
  } catch (e) {
    console.error("❌ verifyAnalysis error:", e);
    return res.status(500).json({ message: "Failed to verify" });
  }
};
