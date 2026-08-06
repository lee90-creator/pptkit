from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw


def create_contact_sheet(source: Path, output: Path, columns: int = 4) -> None:
    paths = sorted(
        (path for path in source.iterdir() if path.suffix.lower() == ".png"),
        key=lambda path: [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", path.name)],
    )
    if not paths:
        raise ValueError(f"no PNG files in {source}")
    images = [Image.open(path).convert("RGB") for path in paths]
    width = 420
    height = round(width * images[0].height / images[0].width)
    label_height = 28
    rows = (len(images) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * width, rows * (height + label_height)), "white")
    draw = ImageDraw.Draw(sheet)
    for index, (path, image) in enumerate(zip(paths, images, strict=True)):
        x = (index % columns) * width
        y = (index // columns) * (height + label_height)
        image.thumbnail((width, height), Image.Resampling.LANCZOS)
        sheet.paste(image, (x, y))
        draw.text((x + 8, y + height + 5), f"{index + 1:02d} {path.stem}", fill="black")
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--columns", type=int, default=4)
    args = parser.parse_args()
    create_contact_sheet(args.source, args.output, args.columns)


if __name__ == "__main__":
    main()
