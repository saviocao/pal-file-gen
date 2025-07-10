# NOTE: This version removes PIL to work inside Pyodide/GitHub Pages.
# Image work must be done in JavaScript and passed to this script via indexed arrays and palettes.

import os
import numpy as np
import json
import js


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


def indexed_to_base64(pixels: np.ndarray, palette: np.ndarray) -> str:
    height, width = pixels.shape
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    for i, color in enumerate(palette):
        rgb[pixels == i] = color
    flat = rgb.reshape(-1, 3)
    return json.dumps({
        "width": width,
        "height": height,
        "pixels": flat.tolist()
    })


def run(data_bundle: dict, output_dir: str):
    has_base = "Base" in data_bundle
    base_indices = None
    preview_data = {}

    if has_base:
        base_pixels = np.array(data_bundle["Base"]["pixels"], dtype=np.uint8)
        base_palette = np.array(data_bundle["Base"]["palette"], dtype=np.uint8)
        base_indices = np.unique(base_pixels)
        pal_text = write_jasc_pal(base_palette)
        js.FS.writeFile(f"{output_dir}/Base.pal", pal_text)

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
        js.FS.writeFile(f"{output_dir}/{pal_out_name}", pal_text)

        if has_base:
            remapped = remap_indices(base_indices, used_indices, pixels)
            preview_data[f"{name}_output.png"] = indexed_to_base64(remapped, palette)
        else:
            preview_data[f"{name}_raw.png"] = indexed_to_base64(pixels, palette)

    js.FS.writeFile(f"{output_dir}/preview.json", json.dumps(preview_data))

# In the browser, this script should be run like:
# run({ "Base": { "pixels": [...], "palette": [...] }, "Sprite1": {...}, ... }, "/output")
