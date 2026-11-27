"""アプリアイコンを作る（紺の背景に赤い早押しボタンと「早」の字）。python tools/make_icons.py"""
from PIL import Image, ImageDraw, ImageFont
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
NAVY, RED, DARKRED, WHITE = (38, 58, 92), (192, 57, 43), (140, 35, 25), (255, 255, 255)
FONT = "C:/Windows/Fonts/YuGothB.ttc"

def draw(size, safe):  # safe: 中身を収める割合（maskable は 0.8 の円に収める）
    S = size * 4
    im = Image.new("RGB", (S, S), NAVY)
    d = ImageDraw.Draw(im)
    c, r = S / 2, S * safe * 0.42
    # 台座
    d.ellipse([c - r * 1.12, c - r * 0.95, c + r * 1.12, c + r * 1.25], fill=(25, 38, 62))
    # ボタンの側面と天面
    d.ellipse([c - r, c - r * 0.78 + r * 0.22, c + r, c + r * 0.78 + r * 0.22], fill=DARKRED)
    d.ellipse([c - r, c - r * 0.78, c + r, c + r * 0.78], fill=RED)
    f = ImageFont.truetype(FONT, int(r * 1.15))
    d.text((c, c - r * 0.05), "早", font=f, fill=WHITE, anchor="mm")
    return im.resize((size, size), Image.LANCZOS)

for size in (192, 512):
    draw(size, 1.0).save(root / f"icons/icon-{size}.png")
    draw(size, 0.8).save(root / f"icons/maskable-{size}.png")
draw(180, 1.0).save(root / "icons/apple-touch-icon.png")
draw(512, 0.9).save(root / "icons/play-icon-512.png")  # Play ストア掲載用（512×512・32bit PNG）
print("ok")
