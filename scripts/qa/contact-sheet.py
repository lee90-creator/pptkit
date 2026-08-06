from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def slide_number(path: Path) -> int:
    match = re.search(r"(\d+)", path.stem)
    return int(match.group(1)) if match else 0


def build_contact_sheet(source: Path, output: Path, columns: int = 4) -> None:
    files = sorted(source.glob("*.PNG"), key=slide_number)
    if not files:
        files = sorted(source.glob("*.png"), key=slide_number)
    if not files:
        raise ValueError(f"No PNG files found in {source}")

    thumb_width, thumb_height, label_height, gutter = 400, 225, 28, 12
    rows = (len(files) + columns - 1) // columns
    sheet = Image.new(
        "RGB",
        (
            columns * thumb_width + (columns + 1) * gutter,
            rows * (thumb_height + label_height) + (rows + 1) * gutter,
        ),
        "white",
    )
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(files):
        image = Image.open(path).convert("RGB")
        thumb = ImageOps.fit(image, (thumb_width, thumb_height), method=Image.Resampling.LANCZOS)
        column, row = index % columns, index // columns
        x = gutter + column * (thumb_width + gutter)
        y = gutter + row * (thumb_height + label_height + gutter)
        sheet.paste(thumb, (x, y))
        draw.text((x, y + thumb_height + 5), f"Slide {slide_number(path)}", fill="black")

    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def main(argv: list[str]) -> None:
    if len(argv) not in (3, 5) or (len(argv) == 5 and argv[3] != "--columns"):
        raise SystemExit("usage: contact-sheet.py SOURCE OUTPUT [--columns N]")
    columns = int(argv[4]) if len(argv) == 5 else 4
    build_contact_sheet(Path(argv[1]), Path(argv[2]), columns)


if __name__ == "__main__":
    main(sys.argv)
