import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PYTHON_PATH =
  process.env.PYTHON_PATH ||
  "C:/Kyrsova/plant-disease-web/ml/.venv/Scripts/python.exe";

const DEFAULT_ML_SCRIPT_PATH =
  process.env.ML_SCRIPT_PATH || path.resolve(__dirname, "../../../ml/predict.py");

let _config = null;

export function initMlWorker(cfg = {}) {
  const pythonPath = cfg.pythonPath || DEFAULT_PYTHON_PATH;
  const scriptPath = cfg.scriptPath || DEFAULT_ML_SCRIPT_PATH;

  _config = {
    pythonPath,
    scriptPath,
    timeoutMs: Number(cfg.timeoutMs || process.env.ML_TIMEOUT_MS || 240000),
  };

  return _config;
}

export function getWorker() {
  if (!_config) initMlWorker();
  return _config;
}

function safeParseJson(stdout) {
  const text = (stdout || "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  const jsonStr = text.slice(first, last + 1);
  return JSON.parse(jsonStr);
}

export async function runPrediction(imageAbsPath) {
  const cfg = getWorker();

  if (!fs.existsSync(cfg.pythonPath)) throw new Error(`Python not found: ${cfg.pythonPath}`);
  if (!fs.existsSync(cfg.scriptPath)) throw new Error(`ML script not found: ${cfg.scriptPath}`);
  if (!fs.existsSync(imageAbsPath)) throw new Error(`Image not found: ${imageAbsPath}`);

  return new Promise((resolve, reject) => {
    execFile(
      cfg.pythonPath,
      [cfg.scriptPath, imageAbsPath],
      { timeout: cfg.timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          const msg = (stderr || "").toString().trim() || error.message || "ML failed";
          return reject(new Error(msg));
        }

        let parsed = null;
        try {
          parsed = safeParseJson(stdout);
        } catch (e) {
          return reject(new Error(`Bad ML JSON: ${e.message}\nSTDOUT:\n${stdout}`));
        }

        if (!parsed) return reject(new Error(`Empty/invalid ML JSON\nSTDOUT:\n${stdout}`));
        return resolve(parsed);
      }
    );
  });
}

export default { initMlWorker, getWorker, runPrediction };
