#!/usr/bin/env python3
"""Fase 5 — bake the main-menu background:
the repository galleon at golden hour (shared by the user in chat, pixel-identical
to the repo copy) upscaled 2x with the game title typeset INTO the sky —
so the menu needs no DOM title (per the game direction: the background image
already carries the title)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import os

SRC = 'upload/pasted_image_1791602449581.png'
OUT = 'public/game/menu/menu_bg.png'
os.makedirs('public/game/menu', exist_ok=True)

im = Image.open(SRC).convert('RGB')
# 2x upscale (LANCZOS) — crisper on large screens, better for baked text
W, H = im.width * 2, im.height * 2
im = im.resize((W, H), Image.LANCZOS)
im = ImageEnhance.Contrast(im).enhance(1.04)
im = ImageEnhance.Color(im).enhance(1.06)

SERIF_B = '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'
if not os.path.exists(SERIF_B):
    SERIF_B = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
SERIF_R = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'

# ---- title typeset into the upper sky (dark violet band) ----
line1 = 'K I N G D O M S   O F   T H E'
line2 = 'FORGOTTEN SEAS'

f1 = ImageFont.truetype(SERIF_B, int(H * 0.052))
f2 = ImageFont.truetype(SERIF_B, int(H * 0.115))

layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)

def measure(draw, text, font):
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0], b[3] - b[1]

w1, h1 = measure(d, line1, f1)
w2, h2 = measure(d, line2, f2)
cx = W // 2
y1 = int(H * 0.075)
y2 = y1 + h1 + int(H * 0.035)

def gold_text(draw, text, font, x, y, anchor='mm'):
    # layered: warm halo → dark navy core → gold gradient → bright edge
    halo = [(x + dx, y + dy) for dx in (-6, 6) for dy in (-6, 6)]
    for hx, hy in halo:
        draw.text((hx, hy), text, font=font, fill=(30, 22, 8, 110),
                  anchor=anchor, stroke_width=0)
    draw.text((x, y), text, font=font, fill=(255, 214, 120, 46),
              anchor=anchor, stroke_width=0)

# render into a sub-layer so we can blur the glow softly
txt = Image.new('RGBA', (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(txt)
gold_text(td, line1, f1, cx, y1 + h1 // 2)
gold_text(td, line2, f2, cx, y2 + h2 // 2)

# vertical gold gradient over the glyph coverage
cov = txt.split()[3].point(lambda a: 1 if a > 24 else 0)
grad = Image.new('RGBA', (W, H))
gd = ImageDraw.Draw(grad)
top = (247, 222, 137)   # pale gold
mid = (232, 182, 76)    # gold
bot = (146, 98, 34)     # deep bronze
yA, yB = y2 - h2 // 2, y2 + h2 // 2
for yy in range(yA - 8, yB + 10):
    if yy < 0 or yy >= H:
        continue
    t = (yy - (yA - 8)) / max(1, (yB + 10) - (yA - 8))
    if t < 0.45:
        c = tuple(int(top[i] + (mid[i] - top[i]) * (t / 0.45)) for i in range(3))
    else:
        c = tuple(int(mid[i] + (bot[i] - mid[i]) * ((t - 0.45) / 0.55)) for i in range(3))
    gd.line([(0, yy), (W, yy)], fill=c + (255,))

# glyph mask → gradient fill, keep the halo
alpha = txt.split()[3]
fill = Image.composite(grad, Image.new('RGBA', (W, H), (0, 0, 0, 0)),
                        cov.point(lambda a: 255 if a else 0))
# bottom-rim light: the lower edge of each glyph catches the warm sun
shift = Image.new('L', (W, H), 0)
shift.paste(alpha, (0, -3))
rim = Image.composite(Image.new('L', (W, H), 255), Image.new('L', (W, H), 0),
                      Image.composite(Image.new('L', (W, H), 0), shift, alpha.point(lambda a: 255 if a > 60 else 0)).point(lambda a: 255 if a else 0)).point(lambda a: 100 if a > 40 else 0)
rimL = alpha.point(lambda a: 255 if a > 60 else 0)
from PIL import ImageChops as IC
rimMask = IC.subtract(alpha.point(lambda a: 255 if a > 60 else 0), shift).point(lambda a: 110 if a > 50 else 0)
bevel = Image.new('RGBA', (W, H), (255, 236, 180, 0))
bevel.putalpha(rimMask)
title_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
# slightly translucent fill (atmospheric integration)
fill.putalpha(fill.split()[3].point(lambda a: int(a * 0.94)))
title_layer.alpha_composite(fill)
title_layer.alpha_composite(bevel)

# soft warm glow behind everything
glow = title_layer.filter(ImageFilter.GaussianBlur(9))
glow = Image.new('RGBA', (W, H), (255, 196, 96, 0)).copy()
ga = title_layer.split()[3].filter(ImageFilter.GaussianBlur(14)).point(lambda a: min(120, a))
glow.putalpha(ga)

im = im.convert('RGBA')
im.alpha_composite(glow)
im.alpha_composite(title_layer)

# subtle vignette so UI text reads at the corners
vg = Image.new('L', (W, H), 0)
vd = ImageDraw.Draw(vg)
vd.rectangle([0, 0, W, H], fill=0)
for i in range(4):
    pad = int(min(W, H) * 0.06) * (4 - i) / 4
    vd.rectangle([pad, pad, W - pad, H - pad], outline=int(18 * (i + 1) / 4), width=int(min(W, H) * 0.05))
vg = vg.filter(ImageFilter.GaussianBlur(min(W, H) * 0.03))
black = Image.new('RGBA', (W, H), (6, 8, 14, 0))
black.putalpha(vg)
im.alpha_composite(black)

im.convert('RGB').save(OUT, quality=92)
print('saved', OUT, im.size, f'{os.path.getsize(OUT)/1024:.0f} KB')
