#!/usr/bin/env python3
"""Software rasterizer for the knight GLB — renders 8 shaded views into one sheet.
Used to understand the sculpt's pose and part boundaries for rigging."""
import numpy as np
import sys
sys.path.insert(0, '/home/z/my-project/scripts')
from knight_analysis import get_triangles
from PIL import Image, ImageDraw

T, TG = get_triangles('public/game/models/knight_statue.glb')
V = T.reshape(-1, 3)
# unique vertex list for triangles: build indexed arrays
n = len(T)
# --- rasterizer state ---
def render_view(azim_deg, elev_deg, size=430, fname=None, sheet=None, ox=0, oy=0, label=''):
    # camera: orbit around model center
    c = V.mean(axis=0)
    az = np.radians(azim_deg); el = np.radians(elev_deg)
    fwd = np.array([np.cos(el) * np.sin(az), np.sin(el), np.cos(el) * np.cos(az)])
    up0 = np.array([0, 1, 0.0])
    right = np.cross(fwd, up0); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    P = V - c
    dist = 300
    cam = c + fwd * dist
    Xs = P @ right; Ys = P @ up; Zs = P @ fwd
    f = 240.0  # focal (window units): model ±100 → ±80 on screen
    W = H = size
    u = np.zeros((n, 3, 2))
    us = (Xs * f / (dist - Zs)); vs = (Ys * f / (dist - Zs))
    umin, umax = -90, 90
    sx = (W - 20) / (umax - umin); sy = (H - 20) / (umax - umin)
    px = 10 + (us - umin) * sx
    py = H - 10 - (vs - umin) * sy
    # per-triangle: vertices
    tri2d = np.stack([px.reshape(n, 3), py.reshape(n, 3)], axis=2)  # (n,3,2)
    depth = Zs.reshape(n, 3).mean(axis=1)
    # lighting: normal in world, light dir from camera up-left
    e1 = T[:, 1] - T[:, 0]; e2 = T[:, 2] - T[:, 0]
    nrm = np.cross(e1, e2)
    ln = np.linalg.norm(nrm, axis=1); ln[ln == 0] = 1
    nrm = nrm / ln[:, None]
    L = np.array([-0.45, 0.75, 0.5]); L /= np.linalg.norm(L)
    lam = np.clip(nrm @ (L * 0.8 + fwd * 0.35), 0, 1)
    # base colors: Upper mesh = light steel, Lower = darker bronze
    base = np.where(TG == 1, 0.72, 0.45)
    amb = 0.34
    col = (amb + lam * 0.9) * base
    # backface cull relative to camera: dot(normal, camdir)
    facecam = nrm @ fwd
    visible = facecam < 0.02  # facing camera
    order = np.argsort(-depth)  # far first
    # painter into zbuffer grid
    grid = np.zeros((H, W), dtype=np.int32)
    zbuf = np.full((H, W), -1e9, dtype=np.float32)
    from PIL import Image as I
    canvas = np.zeros((H, W, 3), dtype=np.uint8)
    canvas[:] = (10, 10, 16)
    cnt = 0
    for ti in order:
        if not visible[ti]: continue
        x0, y0 = tri2d[ti, 0]; x1, y1 = tri2d[ti, 1]; x2, y2 = tri2d[ti, 2]
        minx = max(int(np.floor(min(x0, x1, x2))), 0); maxx = min(int(np.ceil(max(x0, x1, x2))), W - 1)
        miny = max(int(np.floor(min(y0, y1, y2))), 0); maxy = min(int(np.ceil(max(y0, y1, y2))), H - 1)
        if minx > maxx or miny > maxy: continue
        d = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if abs(d) < 1e-9: continue
        shade = int(np.clip(col[ti], 0, 1) * 255)
        gray = (shade, shade, int(shade * 1.02))
        # split by mesh tag for subtle tint
        if TG[ti] == 1:
            colr = (int(shade*0.92), int(shade*0.97), int(shade*1.05))
        else:
            colr = (int(shade*1.05), int(shade*0.95), int(shade*0.82))
        yy, xx = np.mgrid[miny:maxy + 1, minx:maxx + 1]
        w0 = ((x1 - xx) * (y2 - yy) - (x2 - xx) * (y1 - yy)) / d
        w1 = ((x2 - xx) * (y0 - yy) - (x0 - xx) * (y2 - yy)) / d
        # w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (((x0 - xx) * (y1 - yy) - (x1 - xx) * (y0 - yy)) / d >= 0)
        ys, xs = yy[inside], xx[inside]
        if len(ys) == 0: continue
        zt = depth[ti]
        better = zt > zbuf[ys, xs]
        if better.any():
            zbuf[ys, xs] = np.where(better, zt, zbuf[ys, xs])
            canvas[ys[better], xs[better]] = np.array(colr, dtype=np.uint8)
        cnt += 1
    img = I.fromarray(canvas)
    img.save(fname)
    print(f'view {label}: tris drawn {cnt}')

sheet = Image.new('RGB', (3 * 440 + 20, 2 * 460 + 30), (8, 8, 12))
views = [
    (0, 8, 'FRONT'), (180, 8, 'BACK'), (90, 8, 'LEFT(-X)'), (-90, 8, 'RIGHT(+X)'),
    (45, 25, '3Q FR-RIGHT'), (135, 25, '3Q BACK-RIGHT'), (225, 40, '3Q TOP-LEFT'), (-45, 12, '3Q FR-LEFT'),
]
for i, (az, el, lab) in enumerate(views):
    ox = 10 + (i % 3) * 440; oy = 10 + (i // 3) * 460
    sub = sheet.crop((ox, oy, ox + 430, oy + 450))
    render_view(az, el, 430, f'/tmp/kv_{lab}.png', sub, ox, oy, lab)
    sheet.paste(sub, (ox, oy))
    d = ImageDraw.Draw(sheet)
    d.text((ox + 6, oy + 452), lab, fill=(240, 240, 240))

sheet.save('/tmp/k_views8.png')
print('saved /tmp/k_views8.png')
