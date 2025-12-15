import os
import json
import argparse
import random
import math
import io
from pathlib import Path

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import numpy as np
import tensorflow as tf
from PIL import Image

from datasets import load_dataset


def set_seed(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    tf.random.set_seed(seed)


def find_parquet_files(root: Path):
    files = sorted([str(p) for p in root.rglob("*.parquet")])
    return files


def split_files_by_name(files):
    train = [f for f in files if "train" in Path(f).name.lower()]
    val = [f for f in files if "valid" in Path(f).name.lower() or "validation" in Path(f).name.lower()]
    test = [f for f in files if "test" in Path(f).name.lower()]

    # якщо датасет не назвав файли як train/val/test — повернемо все в train і розіб’ємо вже після load_dataset
    if len(train) == 0 and len(val) == 0 and len(test) == 0:
        return {"all": files}

    out = {}
    if train: out["train"] = train
    if val: out["validation"] = val
    if test: out["test"] = test
    return out


def decode_any_image(x):
    """
    Підтримує формати, які часто трапляються в HF parquet:
    - PIL.Image
    - dict з keys: {bytes, path}
    """
    if x is None:
        return None

    if isinstance(x, Image.Image):
        return x.convert("RGB")

    if isinstance(x, dict):
        b = x.get("bytes", None)
        p = x.get("path", None)
        if b is not None:
            return Image.open(io.BytesIO(b)).convert("RGB")
        if p:
            return Image.open(p).convert("RGB")

    # інколи буває просто шлях
    if isinstance(x, str) and Path(x).exists():
        return Image.open(x).convert("RGB")

    return None


def make_tf_dataset(hfds, image_col, label_col, img_size, batch_size, shuffle, max_samples, seed):
    n = len(hfds)
    if max_samples and max_samples > 0:
        n = min(n, max_samples)

    indices = list(range(n))
    if shuffle:
        rng = random.Random(seed)
        rng.shuffle(indices)

    def gen():
        for idx in indices:
            ex = hfds[idx]
            img = decode_any_image(ex[image_col])
            if img is None:
                continue
            img = img.resize((img_size, img_size))
            arr = np.asarray(img, dtype=np.float32) / 255.0
            y = ex[label_col]
            yield arr, y

    output_signature = (
        tf.TensorSpec(shape=(img_size, img_size, 3), dtype=tf.float32),
        tf.TensorSpec(shape=(), dtype=tf.int32),
    )

    ds = tf.data.Dataset.from_generator(gen, output_signature=output_signature)
    if shuffle:
        ds = ds.shuffle(buffer_size=min(10_000, n), seed=seed, reshuffle_each_iteration=True)
    ds = ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)
    return ds, n


def build_model(num_classes, img_size, lr):
    base = tf.keras.applications.EfficientNetV2B0(
        include_top=False,
        weights="imagenet",
        input_shape=(img_size, img_size, 3),
    )
    base.trainable = False  # стартуємо як transfer learning

    inputs = tf.keras.Input(shape=(img_size, img_size, 3))
    x = inputs
    x = tf.keras.layers.RandomFlip("horizontal")(x)
    x = tf.keras.layers.RandomRotation(0.06)(x)
    x = tf.keras.layers.RandomZoom(0.10)(x)
    x = base(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.25)(x)
    outputs = tf.keras.layers.Dense(num_classes, activation="softmax")(x)

    model = tf.keras.Model(inputs, outputs)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=lr),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model, base


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data_dir", type=str, default="data/plantnet300k")
    ap.add_argument("--out_model", type=str, default="plantnet_model.keras")
    ap.add_argument("--out_labels", type=str, default="plantnet_labels.json")
    ap.add_argument("--img_size", type=int, default=224)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--max_train", type=int, default=0, help="0 = весь train; для тесту постав 20000")
    ap.add_argument("--max_val", type=int, default=0)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    set_seed(args.seed)

    root = Path(args.data_dir).resolve()
    if not root.exists():
        raise SystemExit(f"❌ Нема папки: {root}")

    parquet = find_parquet_files(root)
    if len(parquet) == 0:
        raise SystemExit("❌ Не знайшов *.parquet у data_dir. Покажи вміст папки, і я підкажу під твій формат.")

    groups = split_files_by_name(parquet)

    print("✅ Parquet знайдено:", len(parquet))
    print("✅ Групи:", {k: len(v) for k, v in groups.items()})

    # Завантаження як HF dataset з локальних parquet
    if "all" in groups:
        ds = load_dataset("parquet", data_files={"train": groups["all"]})
        # самі розіб’ємо на train/val
        split = ds["train"].train_test_split(test_size=0.12, seed=args.seed)
        train_hf = split["train"]
        val_hf = split["test"]
    else:
        ds = load_dataset("parquet", data_files=groups)
        train_hf = ds["train"]
        val_hf = ds["validation"] if "validation" in ds else ds["test"]

    # Знайдемо назви колонок
    cols = train_hf.column_names
    image_col = "image" if "image" in cols else None
    label_col = "label" if "label" in cols else None
    if image_col is None or label_col is None:
        raise SystemExit(f"❌ Не бачу колонок image/label. Є тільки: {cols}. Скинь мені ці колонки — я підлаштую код.")

    # labels: зробимо map int->name якщо є class labels
    label_names = None
    try:
        feat = train_hf.features[label_col]
        if hasattr(feat, "names") and feat.names:
            label_names = list(feat.names)
    except Exception:
        pass

    if label_names is None:
        # якщо label просто int без назв — назвемо як class_0...
        max_label = int(max(train_hf[label_col][:10000]))  # грубо, але ок для старту
        label_names = [f"class_{i}" for i in range(max_label + 1)]

    num_classes = len(label_names)
    print("✅ Класів:", num_classes)

    # TF datasets
    train_tf, train_n = make_tf_dataset(
        train_hf, image_col, label_col, args.img_size, args.batch,
        shuffle=True, max_samples=args.max_train, seed=args.seed
    )
    val_tf, val_n = make_tf_dataset(
        val_hf, image_col, label_col, args.img_size, args.batch,
        shuffle=False, max_samples=args.max_val, seed=args.seed
    )

    print(f"✅ Train прикладів: {train_n}, Val прикладів: {val_n}")

    model, base = build_model(num_classes, args.img_size, args.lr)

    steps_per_epoch = max(1, math.floor(train_n / args.batch))
    val_steps = max(1, math.floor(val_n / args.batch))

    ckpt = tf.keras.callbacks.ModelCheckpoint(
        filepath="plantnet_best.keras",
        monitor="val_accuracy",
        save_best_only=True,
        verbose=1,
    )
    early = tf.keras.callbacks.EarlyStopping(
        monitor="val_accuracy",
        patience=2,
        restore_best_weights=True,
        verbose=1,
    )

    print("🚀 Старт тренування (transfer learning)...")
    model.fit(
        train_tf,
        validation_data=val_tf,
        epochs=args.epochs,
        steps_per_epoch=steps_per_epoch,
        validation_steps=val_steps,
        callbacks=[ckpt, early],
        verbose=1,
    )

    # легкий finetune останніх шарів
    print("🛠️ Finetune: розморожую частину EfficientNet...")
    base.trainable = True
    for layer in base.layers[:-40]:
        layer.trainable = False

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=args.lr * 0.1),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )

    model.fit(
        train_tf,
        validation_data=val_tf,
        epochs=max(1, args.epochs // 2),
        steps_per_epoch=steps_per_epoch,
        validation_steps=val_steps,
        verbose=1,
    )

    out_model = Path(args.out_model).resolve()
    out_labels = Path(args.out_labels).resolve()

    model.save(out_model)
    with open(out_labels, "w", encoding="utf-8") as f:
        json.dump({i: name for i, name in enumerate(label_names)}, f, ensure_ascii=False, indent=2)

    print("✅ Збережено модель:", out_model)
    print("✅ Збережено labels:", out_labels)
    print("🎉 Готово!")


if __name__ == "__main__":
    main()
