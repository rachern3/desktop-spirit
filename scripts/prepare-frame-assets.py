#!/usr/bin/env python3
"""Split legacy sprite sheets into isolated, normalized frame PNGs.

Run with the bundled Codex Python runtime (Pillow + NumPy). The four even turn
frames may be supplied as repaired alpha PNGs; odd frames and actions are
extracted from the legacy sheets. Only the largest connected alpha component is
kept, which removes hands, hair and wings leaking in from neighboring cells.
"""

from pathlib import Path
import sys

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
TURN_SHEET = ASSETS / "turnaround-sprite-v3.png"
ACTION_SHEET = ASSETS / "action-poses-v3.png"
TURN_OUT = ASSETS / "turn-frames-v4"
ACTION_OUT = ASSETS / "action-frames-v4"


def split_cell(sheet: Image.Image, index: int, count: int) -> Image.Image:
    width, height = sheet.size
    left = round(index * width / count)
    right = round((index + 1) * width / count)
    return sheet.crop((left, 0, right, height)).convert("RGBA")


def largest_component(image: Image.Image, threshold: int = 8) -> Image.Image:
    rgba = np.array(image.convert("RGBA"))
    mask = rgba[:, :, 3] > threshold
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    largest = []

    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        queue = [(int(y), int(x))]
        seen[y, x] = True
        points = []
        while queue:
            current_y, current_x = queue.pop()
            points.append((current_y, current_x))
            for delta_y, delta_x in (
                (-1, -1), (-1, 0), (-1, 1),
                (0, -1), (0, 1),
                (1, -1), (1, 0), (1, 1),
            ):
                next_y = current_y + delta_y
                next_x = current_x + delta_x
                if (
                    0 <= next_y < height
                    and 0 <= next_x < width
                    and mask[next_y, next_x]
                    and not seen[next_y, next_x]
                ):
                    seen[next_y, next_x] = True
                    queue.append((next_y, next_x))
        if len(points) > len(largest):
            largest = points

    keep = np.zeros_like(mask, dtype=bool)
    if largest:
        ys, xs = zip(*largest)
        keep[np.array(ys), np.array(xs)] = True
    rgba[~keep] = 0
    return Image.fromarray(rgba, "RGBA")


def normalize(
    image: Image.Image,
    canvas_size: tuple[int, int],
    target_height: int,
    baseline: int,
    max_width: int,
) -> Image.Image:
    bounds = image.getbbox()
    if not bounds:
        raise ValueError("Frame contains no visible pixels")
    subject = image.crop(bounds)
    scale = min(target_height / subject.height, max_width / subject.width)
    size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    x = round((canvas_size[0] - subject.width) / 2)
    y = baseline - subject.height
    canvas.alpha_composite(subject, (x, y))
    return canvas


def prepare_turn_frames(repaired_dir: Path) -> None:
    TURN_OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(TURN_SHEET).convert("RGBA")
    for index in range(8):
        repaired = repaired_dir / f"turn-{index}-alpha.png"
        source = Image.open(repaired).convert("RGBA") if repaired.exists() else split_cell(sheet, index, 8)
        clean = largest_component(source)
        frame = normalize(clean, (260, 740), target_height=700, baseline=720, max_width=244)
        frame.save(TURN_OUT / f"turn-{index}.png", optimize=True)


def prepare_action_frames() -> None:
    ACTION_OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(ACTION_SHEET).convert("RGBA")
    for index in range(4):
        clean = largest_component(split_cell(sheet, index, 4))
        frame = normalize(clean, (300, 800), target_height=700, baseline=780, max_width=280)
        frame.save(ACTION_OUT / f"action-{index}.png", optimize=True)


def main() -> None:
    repaired_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/private/tmp/desktop-spirit-v4")
    prepare_turn_frames(repaired_dir)
    prepare_action_frames()
    print(f"Prepared 8 turn frames in {TURN_OUT}")
    print(f"Prepared 4 action frames in {ACTION_OUT}")


if __name__ == "__main__":
    main()
