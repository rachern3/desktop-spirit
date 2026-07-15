#!/usr/bin/env python3
"""Create a macOS app icon from the approved transparent character sprite."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SPRITE = ROOT / "assets" / "spirit.png"
BUILD = ROOT / "build"


def make_master() -> Image.Image:
    size = 1024
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((42, 42, 982, 982), radius=218, fill=255)

    background = Image.new("RGBA", (size, size), "#102326")
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((360, 210, 1040, 940), fill=(25, 202, 151, 132))
    glow = glow.filter(ImageFilter.GaussianBlur(115))
    background.alpha_composite(glow)

    sprite = Image.open(SPRITE).convert("RGBA")
    portrait = sprite.crop((34, 0, 755, 1130))
    portrait.thumbnail((880, 1030), Image.Resampling.LANCZOS)
    x = (size - portrait.width) // 2 + 12
    y = 80
    background.alpha_composite(portrait, (x, y))

    clipped = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    clipped.paste(background, (0, 0), mask)
    border = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle(
        (43, 43, 981, 981), radius=218, outline=(201, 172, 104, 168), width=5
    )
    clipped.alpha_composite(border)
    return clipped


def main() -> None:
    BUILD.mkdir(parents=True, exist_ok=True)
    iconset = BUILD / "icon.iconset"
    iconset.mkdir(parents=True, exist_ok=True)
    master = make_master()
    master.save(BUILD / "icon.png", optimize=True)

    for points in (16, 32, 128, 256, 512):
        master.resize((points, points), Image.Resampling.LANCZOS).save(
            iconset / f"icon_{points}x{points}.png"
        )
        pixels = points * 2
        master.resize((pixels, pixels), Image.Resampling.LANCZOS).save(
            iconset / f"icon_{points}x{points}@2x.png"
        )


if __name__ == "__main__":
    main()
