import os

# ВАЖЛИВО: забороняємо Transformers чіпати TensorFlow/Keras
os.environ["TRANSFORMERS_NO_TF"] = "1"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import json
import sys
from typing import Any, Dict, List
from PIL import Image

DISEASE_MODEL = os.getenv("DISEASE_MODEL", "mesabo/agri-plant-disease-resnet50")
CLIP_MODEL = os.getenv("CLIP_MODEL", "openai/clip-vit-base-patch32")

PLANT_MIN_SCORE = float(os.getenv("PLANT_MIN_SCORE", "0.55"))
TOP_K = int(os.getenv("TOP_K", "3"))

PLANT_LABELS = [
    "a photo of a plant",
    "a photo of a plant leaf",
    "a photo of a leaf",
    "a photo of a flower",
    "a photo of a tree",
]
NONPLANT_LABELS = [
    "a photo of a person",
    "a photo of a face",
    "a photo of an animal",
    "a photo of food",
    "a photo of a car",
    "a photo of a building",
    "a photo of a document",
    "a photo of a random object",
]
CANDIDATE_LABELS = PLANT_LABELS + NONPLANT_LABELS


def emit(obj: Dict[str, Any], exit_code: int = 0) -> None:
    # ASCII stdout (без проблем кодування в Node)
    print(json.dumps(obj, ensure_ascii=True))
    sys.exit(exit_code)


def safe_open_image(image_path: str) -> Image.Image:
    try:
        return Image.open(image_path).convert("RGB")
    except Exception:
        emit(
            {
                "ok": False,
                "reason": "bad_image",
                "message": "Не вдалося прочитати зображення (пошкоджений файл або не-картинка).",
            },
            0,
        )


def clip_gate(image: Image.Image) -> Dict[str, Any]:
    try:
        import torch
        from transformers import CLIPModel, CLIPProcessor
    except Exception as e:
        return {"ok": False, "reason": "clip_missing", "message": f"CLIP import error: {e}"}

    device = "cuda" if torch.cuda.is_available() else "cpu"

    processor = CLIPProcessor.from_pretrained(CLIP_MODEL)
    model = CLIPModel.from_pretrained(CLIP_MODEL).to(device)
    model.eval()

    inputs = processor(text=CANDIDATE_LABELS, images=image, return_tensors="pt", padding=True)
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1).detach().cpu().numpy()[0]

    scores = {CANDIDATE_LABELS[i]: float(probs[i]) for i in range(len(CANDIDATE_LABELS))}
    plant_score = sum(scores[lbl] for lbl in PLANT_LABELS)

    best_label = max(scores, key=scores.get)
    best_score = scores[best_label]

    return {
        "ok": True,
        "plant_score": plant_score,
        "best_clip_label": best_label,
        "best_clip_score": best_score,
        "device": device,
    }


def disease_predict(image: Image.Image, top_k: int) -> Dict[str, Any]:
    try:
        import torch
        from transformers import pipeline
    except Exception as e:
        return {"ok": False, "reason": "hf_missing", "message": f"transformers/torch import error: {e}"}

    device = 0 if torch.cuda.is_available() else -1

    # ВАЖЛИВО: framework="pt" -> тільки PyTorch
    pipe = pipeline(
        "image-classification",
        model=DISEASE_MODEL,
        device=device,
        framework="pt",
    )

    preds = pipe(image, top_k=top_k)

    top: List[Dict[str, Any]] = [{"label": p.get("label", ""), "score": float(p.get("score", 0.0))} for p in preds]
    best = top[0] if top else {"label": None, "score": None}

    return {
        "ok": True,
        "predicted_key": best["label"],
        "confidence": best["score"],
        "top": top,
        "model": DISEASE_MODEL,
    }


def main() -> None:
    if len(sys.argv) < 2:
        emit({"ok": False, "reason": "no_arg", "message": "Usage: predict.py <image_path>"}, 0)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        emit({"ok": False, "reason": "no_file", "message": "Image file not found", "path": image_path}, 0)

    image = safe_open_image(image_path)

    gate = clip_gate(image)
    if not gate.get("ok"):
        emit(gate, 0)

    plant_score = float(gate["plant_score"])
    if plant_score < PLANT_MIN_SCORE:
        emit(
            {
                "ok": False,
                "reason": "not_plant",
                "message": "Схоже, на фото не рослина/листок. Спробуй сфотографувати ближче листок при нормальному освітленні.",
                "plant_score": plant_score,
                "best_clip_label": gate.get("best_clip_label"),
                "best_clip_score": gate.get("best_clip_score"),
            },
            0,
        )

    dis = disease_predict(image, TOP_K)
    if not dis.get("ok"):
        emit(dis, 0)

    emit(
        {
            "ok": True,
            "predicted_key": dis.get("predicted_key"),
            "confidence": dis.get("confidence"),
            "top": dis.get("top", []),
            "plant_score": plant_score,
            "best_clip_label": gate.get("best_clip_label"),
            "best_clip_score": gate.get("best_clip_score"),
            "meta": {
                "disease_model": dis.get("model"),
                "clip_model": CLIP_MODEL,
                "plant_min_score": PLANT_MIN_SCORE,
            },
        },
        0,
    )


if __name__ == "__main__":
    main()
