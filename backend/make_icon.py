from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
PUBLIC = ROOT / "public"
ASSETS.mkdir(exist_ok=True)
PUBLIC.mkdir(exist_ok=True)

size = 256
cell = size // 4
image = Image.new("RGBA", (size, size), "#20242a")
draw = ImageDraw.Draw(image)
for row in range(4):
    for col in range(4):
        color = "#d4d6d9" if (row + col) % 2 == 0 else "#59616b"
        draw.rectangle((col * cell, row * cell, (col + 1) * cell, (row + 1) * cell), fill=color)

font_path = Path(r"C:\Windows\Fonts\seguisym.ttf")
font = ImageFont.truetype(str(font_path), 150) if font_path.exists() else ImageFont.load_default()
glyph = "♞"
box = draw.textbbox((0, 0), glyph, font=font, stroke_width=3)
x = (size - (box[2] - box[0])) / 2 - box[0]
y = (size - (box[3] - box[1])) / 2 - box[1] - 4
draw.text((x, y), glyph, font=font, fill="#17191d", stroke_width=3, stroke_fill="#f1f2f3")

image.save(PUBLIC / "favicon.png", format="PNG")
image.save(ASSETS / "chess-anki-maker.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
