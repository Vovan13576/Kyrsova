import sys
import json
import os
from pathlib import Path

# --- зробимо TF максимально "тихим" ---
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import numpy as np
import tensorflow as tf
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.h5"
LABELS_PATH = BASE_DIR / "labels.json"

IMG_SIZE = 224
TOP_K = 3

# М'якший поріг (під темні листки теж)
PLANT_MIN_RATIO = 0.006   # 0.6% кадру має виглядати як "рослинна область"
UNSURE_THRESHOLD = 0.60   # якщо top1 < 0.60 -> "не впевнено"


def center_crop_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def plant_bbox_crop(img: Image.Image) -> tuple[Image.Image, float]:
    """
    Детектор "листок у кадрі" (стабільніше ніж просто green):
    - ExG = 2G - R - B (ловить темно-зелені, хворі, різні відтінки)
    - HSV (зелений відтінок + насиченість/яскравість)
    Повертає (cropped_image, plant_ratio).
    """
    arr = np.array(img.convert("RGB"))
    r = arr[..., 0].astype(np.int16)
    g = arr[..., 1].astype(np.int16)
    b = arr[..., 2].astype(np.int16)

    # ExG (м'яко)
    exg = 2 * g - r - b
    exg_mask = (exg > 15) & (g > 35)

    # HSV green-ish (PIL HSV: H 0..255)
    hsv = np.array(img.convert("HSV"))
    h = hsv[..., 0].astype(np.int16)
    s = hsv[..., 1].astype(np.int16)
    v = hsv[..., 2].astype(np.int16)

    # приблизно зелений діапазон + м'які пороги
    hsv_green = (h >= 20) & (h <= 85) & (s >= 25) & (v >= 25)

    mask = exg_mask | hsv_green
    plant_ratio = float(mask.mean())

    # якщо рослинної області мало — повертаємо центр-кроп
    if plant_ratio < PLANT_MIN_RATIO:
        return center_crop_square(img), plant_ratio

    ys, xs = np.where(mask)
    y1, y2 = ys.min(), ys.max()
    x1, x2 = xs.min(), xs.max()

    # padding 12%
    H, W = arr.shape[0], arr.shape[1]
    pad_y = int((y2 - y1) * 0.12)
    pad_x = int((x2 - x1) * 0.12)

    y1 = max(0, y1 - pad_y)
    y2 = min(H - 1, y2 + pad_y)
    x1 = max(0, x1 - pad_x)
    x2 = min(W - 1, x2 + pad_x)

    cropped = img.crop((x1, y1, x2 + 1, y2 + 1))
    cropped = center_crop_square(cropped)
    return cropped, plant_ratio


def load_labels() -> dict[int, str]:
    with open(LABELS_PATH, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {int(k): v for k, v in raw.items()}


def preprocess(img_path: str) -> tuple[np.ndarray, float]:
    img = Image.open(img_path).convert("RGB")
    cropped, plant_ratio = plant_bbox_crop(img)
    cropped = cropped.resize((IMG_SIZE, IMG_SIZE))
    x = np.array(cropped).astype(np.float32) / 255.0
    x = np.expand_dims(x, axis=0)
    return x, plant_ratio


def main():
    if len(sys.argv) < 2:
        sys.stdout.write(json.dumps({"error": "No image path provided"}, ensure_ascii=False))
        return

    img_path = sys.argv[1]

    if not MODEL_PATH.exists():
        sys.stdout.write(json.dumps({"error": f"Model not found: {str(MODEL_PATH)}"}, ensure_ascii=False))
        return

    if not LABELS_PATH.exists():
        sys.stdout.write(json.dumps({"error": f"Labels not found: {str(LABELS_PATH)}"}, ensure_ascii=False))
        return

    # load model + labels
    model = tf.keras.models.load_model(MODEL_PATH)
    labels = load_labels()

    x, plant_ratio = preprocess(img_path)

    # якщо рослину не бачимо — одразу віддаємо plant_detected=false
    if plant_ratio < PLANT_MIN_RATIO:
        sys.stdout.write(json.dumps({
            "plant_detected": False,
            "reason": "Plant/leaf not detected (low plant area in frame)",
            "plant_ratio": plant_ratio
        }, ensure_ascii=False))
        return

    preds = model.predict(x, verbose=0)[0]   # verbose=0 щоб не ламати JSON
    top_idx = np.argsort(preds)[::-1][:TOP_K]

    top = []
    for i in top_idx:
        top.append({
            "key": labels.get(int(i), f"class_{int(i)}"),
            "confidence": float(preds[i])
        })

    best = top[0]
    is_unsure = best["confidence"] < UNSURE_THRESHOLD

    sys.stdout.write(json.dumps({
        "plant_detected": True,
        "unsure": bool(is_unsure),
        "plant_ratio": plant_ratio,
        "predictedKey": best["key"],
        "confidence": float(best["confidence"]),
        "top": top
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
