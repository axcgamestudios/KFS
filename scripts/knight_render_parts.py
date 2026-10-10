#!/usr/bin/env python3
"""Render knight model colored by connected component (top components) —
front + side + 3/4 views in one image, so parts can be identified visually."""
import numpy as np
import sys
sys.path.insert(0, '/home/z/my-project/scripts')
from knight_analysis import get_triangles
from knight_components import components
from PIL import Image, ImageDraw

T, TG = get_triangles('public/game/models/knight_statue.glb')

# assign per-triangle component index (0 = bulk UPPER, 1 = bulk LOWER, 2.. = smaller)
parts = []
for tag in (1, 0):
    sub = T[TG == tag]
    roots = components(sub)
    uniq, counts = np.unique(roots, return_counts=True)
    order = np.argsort(-counts)
    for r in order:
        if counts[r] < 60: break
        mask = roots == uniq[r]
        parts.append((tag, sub[mask]))
        print(f'part {len(parts)}: tag={"UP" if tag else "LO"} tris={mask.sum()} y:{sub[mask][:,:,1].min():.0f}..{sub[mask][:,:,1].max():.0f} x:{sub[mask][:,:,0].min():.0f}..{sub[mask][:,:,0].max():.0f} z:{sub[mask][:,:,2].min():.0f}..{sub[mask][:,:,2].max():.0f}')

COLORS = [
    (230, 60, 60), (60, 200, 90), (70, 120, 255), (255, 200, 60),
    (200, 80, 255), (60, 220, 220), (255, 130, 60), (160, 160, 160),
    (255, 100, 160), (120, 255, 120),
]

W, H, pad = 3 * 420 + 40, 560, 20
img = Image.new('RGB', (W, H), (10, 10, 16))
d = ImageDraw.Draw(img)
pts_all = T.reshape(-1, 3)
xmin, xmax = pts_all[:, 0].min(), pts_all[:, 0].max()
ymin, ymax = pts_all[:, 1].min(), pts_all[:, 1].max()
zmin, zmax = pts_all[:, 2].min(), pts_all[:, 2].max()

views = [('FRONT (x-y)', 0, 1, dict(xrev=False)), ('SIDE (z-y)', 2, 1, dict()), ('TOP (x-z)', 0, 2, dict())]
for vi, (label, ax, ay, _) in enumerate(views):
    x0 = 20 + vi * 430
    sub = img.crop((0, 0, 0, 0))
    d.rectangle([x0, 40, x0 + 400, 540], outline=(60, 60, 80))
    d.text((x0 + 4, 22), label, fill=(240, 240, 240))
    for pi, (tag, tris) in enumerate(parts):
        col = COLORS[pi % len(COLORS)]
        P = tris.reshape(-1, 3)
        # sample
        step = max(1, len(P) // 22000)
        P = P[::step]
        if ax == 0: A = P[:, 0]
        elif ax == 2: A = P[:, 2]
        else: A = P[:, 0]
        if ay == 1: B = P[:, 1]
        else: B = P[:, 2]
        amin, amax = (xmin, xmax) if ax == 0 else ((ymin, ymax) if ax == 1 else (zmin, zmax))
        bmin, bmax = (ymin, ymax) if ay == 1 else (zmin, zmax)
        sx = 380 / (amax - amin); sy = 480 / (bmax - bmin)
        for i in range(len(P)):
            x = x0 + 10 + (A[i] - amin) * sx
            y = 540 - (B[i] - bmin) * sy
            d.point((x, y), fill=col)

# legend
d.text((20, 545), ' | '.join(f'P{i+1}={"UP" if t else "LO"}' for i, (t, _) in enumerate(parts)), fill=(200, 200, 200))
img.save('/tmp/k_parts.png')
print('saved /tmp/k_parts.png')
