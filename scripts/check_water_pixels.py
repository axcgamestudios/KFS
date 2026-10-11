"""Verify the ocean renders: sample screenshots and check for blue water pixels."""
from PIL import Image
import sys

def analyze(path, region=None, label=""):
    img = Image.open(path).convert('RGB')
    w, h = img.size
    # Default: bottom-center band (where the sea should be)
    x0, y0, x1, y1 = region or (int(w*0.25), int(h*0.55), int(w*0.75), int(h*0.92))
    px = img.crop((x0, y0, x1, y1))
    data = list(px.getdata())
    n = len(data)
    blue = sum(1 for r, g, b in data if b > r + 8 and b >= g and b > 40)
    greenish = sum(1 for r, g, b in data if g > r + 8 and b > r + 4 and g > 60)  # turquoise
    water = blue + greenish
    pct = 100.0 * water / n
    # average color
    ar = sum(d[0] for d in data) / n
    ag = sum(d[1] for d in data) / n
    ab = sum(d[2] for d in data) / n
    print(f"{label or path}: waterish={pct:.1f}% avgRGB=({ar:.0f},{ag:.0f},{ab:.0f}) size={w}x{h}")
    return pct

if __name__ == '__main__':
    ok = True
    for path in sys.argv[1:]:
        pct = analyze(path)
        if pct < 8:
            ok = False
            print(f"  ^^ FAIL: no water detected (<8%)")
    sys.exit(0 if ok else 1)
