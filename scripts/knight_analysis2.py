#!/usr/bin/env python3
"""Knight rigging analysis, phase 2: memory-safe grid clustering for upper body
sections + top-down view render."""
import numpy as np
from PIL import Image, ImageDraw
import sys
sys.path.insert(0, '/home/z/my-project/scripts')
from knight_analysis import get_triangles

T, TG = get_triangles('public/game/models/knight_statue.glb')
pts = T.reshape(-1, 3)
ylo, yhi = pts[:, 1].min(), pts[:, 1].max()
print(f'tris={len(T)} pts={len(pts)} y: {ylo:.0f}..{yhi:.0f}')

CELL = 7.0

def grid_clusters(band):
    """Cluster 2D points by connected occupied grid cells (8-neighbors)."""
    if len(band) == 0: return []
    ix = np.floor((band[:, 0] - band[:, 0].min()) / CELL).astype(int)
    iz = np.floor((band[:, 2] - band[:, 2].min()) / CELL).astype(int)
    W = ix.max() + 1; H = iz.max() + 1
    grid = np.zeros((H, W), dtype=bool)
    grid[iz, ix] = True
    # connected components (4-neighbor is fine; cells are 7 units, gap<14 joins)
    from scipy import ndimage
    lab, n = ndimage.label(grid)
    out = []
    for i in range(1, n + 1):
        cellsmask = lab == i
        sel = np.zeros(len(band), dtype=bool)
        for r, c in zip(*np.where(cellsmask)):
            sel |= (iz == r) & (ix == c)
        sub = band[sel]
        if len(sub) > 20:
            out.append((len(sub), sub[:, 0].mean(), sub[:, 2].mean(),
                        sub[:, 0].min(), sub[:, 0].max(), sub[:, 2].min(), sub[:, 2].max()))
    out.sort(reverse=True)
    return out

print('\n=== SECTIONS (y, clusters) ===')
for h in np.arange(ylo + 4, yhi - 2, 5.0):
    band = pts[(pts[:, 1] > h - 2.5) & (pts[:, 1] < h + 2.5)]
    if len(band) < 25: continue
    cl = grid_clusters(band)
    desc = '  '.join(f'[n={n} x={mx:.0f} z={mz:.0f} x:{x0:.0f}..{x1:.0f} z:{z0:.0f}..{z1:.0f}]'
                     for n, mx, mz, x0, x1, z0, z1 in cl[:7])
    print(f'y={h:7.1f} pts={len(band):5d}  {desc}')

# ---- top-down render with height coloring + 3/4 view ----
def render(view_ax, view_ay, fname, sz=(760, 760)):
    # project: use two axes
    W, H = sz
    img = Image.new('RGB', (W, H), (14, 14, 20))
    d = ImageDraw.Draw(img)
    # world bounds
    xmin, xmax = pts[:, 0].min(), pts[:, 0].max()
    zmin, zmax = pts[:, 2].min(), pts[:, 2].max()
    ymin, ymax = ylo, yhi
    # horizontal axis = a (0=x,2=z), vertical axis = y or other
    if view_ax == 'x': a = pts[:, 0]; amin, amax = xmin, xmax
    else: a = pts[:, 2]; amin, amax = zmin, zmax
    if view_ay == 'y': b = pts[:, 1]; bmin, bmax = ymin, ymax
    elif view_ay == 'x': b = pts[:, 0]; bmin, bmax = xmin, xmax
    else: b = pts[:, 2]; bmin, bmax = zmin, zmax
    pad = 30
    sx = (W - 2 * pad) / (amax - amin)
    sy = (H - 2 * pad) / (bmax - bmin)
    # color by tag: Upper=steel blue, Lower=amber
    step = max(1, len(pts) // 60000)
    P = pts[::step]
    A = a[::step]; B = b[::step]
    G = TG[np.arange(0, len(T), 3)[::step] * 0] if False else None
    # tag per point
    tags_pt = np.repeat(TG, 3)[::step]
    for i in range(len(P)):
        x = pad + (A[i] - amin) * sx
        y = H - pad - (B[i] - bmin) * sy
        col = (150, 190, 255) if tags_pt[i] == 1 else (255, 170, 90)
        d.point((x, y), fill=col)
    d.text((8, 6), f'view ax={view_ax} ay={view_ay} (blue=Upper steel, amber=Lower)', fill=(235, 235, 235))
    img.save(fname)
    print('saved', fname)

render('x', 'y', '/tmp/k_front.png')     # front view: x horizontal, y vertical
render('z', 'y', '/tmp/k_side.png')      # side view
render('x', 'z', '/tmp/k_top.png')       # top-down: x horizontal, z vertical
