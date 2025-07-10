import os
import numpy as np
from typing import Tuple
from io import BytesIO
import pyodide_http
pyodide_http.patch_all()

try:
    from PIL import Image
except ImportError:
    from pyodide.code import run_python_async
    await run_python_async("import micropip; await micropip.install('Pillow')")
    from PIL import Image

# -------------------- Utility Functions --------------------

def scale_to_64(image: Image.Image) -> Image.Image:
    if image.mode != "P":
        raise ValueError("Image must be in indexed (palette) mode 'P'.")

    arr = np.array(image)
    height, width = arr.shape

    if height % 64 != 0:
        raise ValueError(f"Image height {height} is not a multiple of 64.")
    if width == 64:
        return image
    if width < 64 or width % 64 != 0:
        raise ValueError(f"Image width {width} is invalid for downscaling.")

    step = width // 64
    new_arr = arr[:, ::step][:, :64]
    new_image = Image.fromarray(new_arr, mode="P")
    new_image.putpalette(image.getpalette())
    return new_image

def get_used_colors(image: Image.Image) -> Tuple[np.ndarray, np.ndarray]:
    arr = np.array(image)
    used_indices = np.unique(arr)
    if len(used_indices) > 16:
        raise ValueError("Image uses more than 16 colors.")
    palette = np.array(image.getpalette(), dtype=np.uint8).reshape(-1, 3)
    used_colors = palette[used_indices]
    return used_indices, used_colors

def write_jasc_pal(palette: np.ndarray) -> str:
    lines = ["JASC-PAL", "0100", str(len(palette))]
    for rgb in palette:
        lines.append(f"{rgb[0]} {rgb[1]} {rgb[2]}")
    return "\n".join(lines)

def apply_base_palette(image: Image.Image, base_palette: np.ndarray) -> Image.Image:
    new_image = image.copy()
    flat_palette = base_palette.flatten().tolist()
    new_image.putpalette(flat_palette + [0] * (768 - len(flat_palette)))
    return new_image

def create_output_image(base_img: Image.Image, other_image: Image.Image, other_palette: np.ndarray,
                         target_width: int, target_height: int) -> Image.Image:
    base_array = np.array(base_img)
    base_img_resized = Image.fromarray(base_array, mode="P")
    slice_ratio = target_height / (base_img.height if base_img.height != 0 else 1)
    crop_height = int(base_img.height * min(slice_ratio, 1.0))
    cropped_base = base_img_resized.crop((0, 0, base_img.width, crop_height))
    scaled_base = cropped_base.resize((target_width, target_height), resample=Image.NEAREST)

    original_palette = np.array(other_image.getpalette(), dtype=np.uint8).reshape(-1, 3)
    unique_indices = np.unique(np.array(scaled_base))
    remapped_palette = np.zeros((256, 3), dtype=np.uint8)
    for idx in unique_indices:
        remapped_palette[idx] = original_palette[idx]

    output_img = scaled_base.convert("P")
    flat_palette = remapped_palette.flatten().tolist()
    output_img.putpalette(flat_palette + [0] * (768 - len(flat_palette)))
    return output_img

# -------------------- Pyodide-Compatible Main Entry Point --------------------

def run(input_root: str, output_root: str):
    for root, dirs, files in os.walk(input_root):
        png_files = [f for f in files if f.endswith(".png")]
        if not png_files:
            continue

        relative_path = os.path.relpath(root, input_root)
        out_subdir = os.path.join(output_root, relative_path)
        os.makedirs(out_subdir, exist_ok=True)

        base_path = os.path.join(root, "Base.png")
        has_base = "Base.png" in png_files
        base_colors = None
        scaled_base = None

        if has_base:
            try:
                with open(base_path, "rb") as f:
                    base_image = Image.open(BytesIO(f.read())).convert("P")
                scaled_base = scale_to_64(base_image)
                _, base_colors = get_used_colors(scaled_base)
                pal_text = write_jasc_pal(base_colors)
                with open(os.path.join(out_subdir, "Base.pal"), "w") as f:
                    f.write(pal_text)
            except Exception as e:
                print(f"Error processing Base.png in {root}: {e}")
                continue

        for fname in png_files:
            if has_base and fname == "Base.png":
                continue

            img_path = os.path.join(root, fname)
            try:
                with open(img_path, "rb") as f:
                    img = Image.open(BytesIO(f.read())).convert("P")
                scaled_img = scale_to_64(img)
                used_indices, used_colors = get_used_colors(scaled_img)

                pal_out_name = f"{os.path.splitext(fname)[0]}.pal" if has_base else f"{os.path.splitext(fname)[0]}_no_base.pal"
                pal_text = write_jasc_pal(used_colors)
                with open(os.path.join(out_subdir, pal_out_name), "w") as f:
                    f.write(pal_text)

                if has_base:
                    target_width = 64
                    aspect_ratio = scaled_base.height / scaled_base.width
                    target_height = round(target_width * aspect_ratio)
                    output_img = create_output_image(scaled_base, img, used_colors, target_width, target_height)
                    output_path = os.path.join(out_subdir, f"{os.path.splitext(fname)[0]}_output.png")
                    output_img.save(output_path)

            except Exception as e:
                print(f"Error processing image {img_path}: {e}")
