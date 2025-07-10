
# NOTE: This version removes PIL to work inside Pyodide/GitHub Pages.
# Image work must be done in JavaScript and passed to this script via indexed arrays and palettes.

import os
import numpy as np
from typing import Tuple
from PIL import Image
import base64
import io

def write_jasc_pal(palette: np.ndarray) -> str:
    lines = ["JASC-PAL", "0100", str(len(palette))]
    for rgb in palette:
        lines.append(f"{rgb[0]} {rgb[1]} {rgb[2]}")
    return "\n".join(lines)

def remap_indices(base_indices: np.ndarray, other_indices: np.ndarray, other_pixels: np.ndarray) -> np.ndarray:
    index_map = {old: new for new, old in enumerate(base_indices)}
    remapped = np.copy(other_pixels)
    for old_idx in np.unique(other_pixels):
        if old_idx in index_map:
            remapped[other_pixels == old_idx] = index_map[old_idx]
    return remapped

def indexed_to_image(pixels: np.ndarray, palette: np.ndarray) -> Image.Image:
    height, width = pixels.shape
    rgb_array = np.zeros((height, width, 3), dtype=np.uint8)
    for i, color in enumerate(palette):
        rgb_array[pixels == i] = color
    return Image.fromarray(rgb_array, mode="RGB")

def image_to_base64(img: Image.Image) -> str:
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_bytes = buffered.getvalue()
    return base64.b64encode(img_bytes).decode('utf-8')

def run(data_bundle: dict, output_dir: str):
    os.makedirs(output_dir, exist_ok=True)
    has_base = "Base" in data_bundle
    base_indices = None
    preview_data = {}

    if has_base:
        base_pixels = np.array(data_bundle["Base"]["pixels"], dtype=np.uint8)
        base_palette = np.array(data_bundle["Base"]["palette"], dtype=np.uint8)
        base_indices = np.unique(base_pixels)
        pal_text = write_jasc_pal(base_palette)
        with open(os.path.join(output_dir, "Base.pal"), "w") as f:
            f.write(pal_text)

    for name, info in data_bundle.items():
        if name == "Base":
            continue
        pixels = np.array(info["pixels"], dtype=np.uint8)
        palette = np.array(info["palette"], dtype=np.uint8)

        used_indices = np.unique(pixels)
        if len(used_indices) > 16:
            print(f"Warning: {name} uses more than 16 colors.")
            continue

        pal_text = write_jasc_pal(palette)
        pal_out_name = f"{name}.pal" if has_base else f"{name}_no_base.pal"
        with open(os.path.join(output_dir, pal_out_name), "w") as f:
            f.write(pal_text)

        if has_base:
            remapped = remap_indices(base_indices, used_indices, pixels)
            image = indexed_to_image(remapped, palette)
            img_out_path = os.path.join(output_dir, f"{name}_output.png")
            image.save(img_out_path)
            preview_data[f"{name}_output.png"] = image_to_base64(image)
        else:
            image = indexed_to_image(pixels, palette)
            img_out_path = os.path.join(output_dir, f"{name}_raw.png")
            image.save(img_out_path)
            preview_data[f"{name}_raw.png"] = image_to_base64(image)

    with open(os.path.join(output_dir, "preview.json"), "w") as f:
        import json
        json.dump(preview_data, f)
