"""Google Play のフィーチャーグラフィック（1024×500）を作る。python tools/make_feature_graphic.py"""
from PIL import Image, ImageDraw, ImageFont
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
W, H = 1024, 500
im = Image.new("RGB", (W, H), (38, 58, 92))
d = ImageDraw.Draw(im)
for i in range(0, W, 48): d.line([(i, 0), (i - 200, H)], fill=(44, 66, 104), width=18)  # 斜めのしま
icon = Image.open(root / "icons/maskable-512.png").resize((300, 300), Image.LANCZOS)
mask = Image.new("L", icon.size, 0); ImageDraw.Draw(mask).ellipse([0, 0, 300, 300], fill=255)
im.paste(icon, (60, 100), mask)
fb = ImageFont.truetype("C:/Windows/Fonts/YuGothB.ttc", 66)
fm = ImageFont.truetype("C:/Windows/Fonts/YuGothB.ttc", 30)
d.text((395, 160), "簡単早押しクイズ", font=fb, fill=(255, 255, 255))
d.text((398, 265), "流れる問題文を、誰よりも早く。", font=fm, fill=(241, 196, 15))
d.text((398, 315), "ひとりで練習／部屋番号で友だちと対戦", font=fm, fill=(230, 235, 245))
im.save(root / "store/feature-graphic.png")
print("ok")
