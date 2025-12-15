import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D
from tensorflow.keras.models import Model
from tensorflow.keras.preprocessing.image import ImageDataGenerator
import json

# ===== НАЛАШТУВАННЯ =====
IMG_SIZE = 224
BATCH_SIZE = 32
EPOCHS = 5
DATA_DIR = "data/train"

# ===== ПІДГОТОВКА ДАНИХ =====
datagen = ImageDataGenerator(
    rescale=1./255,
    validation_split=0.2
)

train_gen = datagen.flow_from_directory(
    DATA_DIR,
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    subset="training"
)

val_gen = datagen.flow_from_directory(
    DATA_DIR,
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    subset="validation"
)

num_classes = train_gen.num_classes

# ===== МОДЕЛЬ =====
base_model = MobileNetV2(
    weights="imagenet",
    include_top=False,
    input_shape=(IMG_SIZE, IMG_SIZE, 3)
)

base_model.trainable = False

x = base_model.output
x = GlobalAveragePooling2D()(x)
x = Dense(128, activation="relu")(x)
output = Dense(num_classes, activation="softmax")(x)

model = Model(inputs=base_model.input, outputs=output)

model.compile(
    optimizer="adam",
    loss="categorical_crossentropy",
    metrics=["accuracy"]
)

# ===== НАВЧАННЯ =====
model.fit(
    train_gen,
    validation_data=val_gen,
    epochs=EPOCHS
)

# ===== ЗБЕРЕЖЕННЯ =====
model.save("model.h5")

labels = {v: k for k, v in train_gen.class_indices.items()}
with open("labels.json", "w", encoding="utf-8") as f:
    json.dump(labels, f, ensure_ascii=False, indent=2)

print("✅ Навчання завершено")
