import sys
import json
import os
from pathlib import Path

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import numpy as np
import tensorflow as tf
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "plantnet_model.keras"
LABELS_PATH = BASE_DIR / "plantnet_labels.json"

IMG_SIZE = 224
TOP_K = 3

# якщо top1 нижче — кажемо що "не впевнено"
UNSURE_THRESHOLD = 0.25


def center_crop_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def preprocess(img_path: str) -> np.ndarray:
    img = Image.open(img_path).convert("RGB")
    img = center_crop_square(img)
    img = img.resize((IMG_SIZE, IMG_SIZE))
    x = np.array(img).astype(np.float32) / 255.0
    x = np.expand_dims(x, axis=0)
    return x


def load_labels() -> dict[int, str]:
    with open(LABELS_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {int(k): v for k, v in raw.items()}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No image path provided"}, ensure_ascii=False))
        return

    img_path = sys.argv[1]

    if not MODEL_PATH.exists():
        print(json.dumps({"error": f"Model not found: {str(MODEL_PATH)}"}, ensure_ascii=False))
        return

    if not LABELS_PATH.exists():
        print(json.dumps({"error": f"Labels not found: {str(LABELS_PATH)}"}, ensure_ascii=False))
        return

    model = tf.keras.models.load_model(MODEL_PATH)
    labels = load_labels()

    x = preprocess(img_path)
    preds = model.predict(x, verbose=0)[0]

    top_idx = np.argsort(preds)[::-1][:TOP_K]
    top = []
    for i in top_idx:
        top.append({
            "key": labels.get(int(i), f"class_{int(i)}"),
            "confidence": float(preds[i])
        })

    best = top[0]
    unsure = best["confidence"] < UNSURE_THRESHOLD

    print(json.dumps({
        "plant_detected": True,
        "unsure": bool(unsure),
        "plantName": best["key"],
        "confidence": float(best["confidence"]),
        "top": top
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
