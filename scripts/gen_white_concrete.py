#!/usr/bin/env python3
"""Regenerate the Fase 16 white concrete PBR set (512x512).

The original files were generated during the Fase 16 session but never
committed; the sandbox restore lost them. This recreates:
  public/game/textures/white_concrete_alb.jpg  — warm-white mottled concrete
  public/game/textures/white_concrete_nrm.jpg  — normal map from the same heightfield
  public/game/textures/white_concrete_rgh.jpg  — roughness with gravel variation
"""
import numpy as np
from PIL import Image
import os

SIZE = 512
OUT = '/home/z/my-project/public/game/textures'
rng = np.random.default_rng(20261016)


def fbm(shape, octaves, base_freq, seed_offset=0):
    """Simple value-noise fBm."""
    n = np.zeros(shape, dtype=np.float64)
    amp = 1.0
    total = 0.0
    for o in range(octaves):
        freq = base_freq * (2 ** o)
        small = (max(2, int(shape[0] / freq)), max(2, int(shape[1] / freq)))
        field = rng.random(small)
        img = Image.fromarray((field * 255).astype(np.uint8)).resize(
            (shape[1], shape[0]), Image.BICUBIC)
        n += np.asarray(img, dtype=np.float64) / 255.0 * amp
        total += amp
        amp *= 0.55
    return n / total


# ---- Heightfield: soft cloud mottling + fine gravel + trowel undulation ----
cloud = fbm((SIZE, SIZE), 4, 6.0)                      # broad cement clouds
fine = fbm((SIZE, SIZE), 3, 28.0)                      # fine sand texture
trowel = fbm((SIZE, SIZE), 2, 3.0)                     # gentle board undulation

# gravel: sparse small aggregates (slightly raised pebbles)
gravel_mask = np.zeros((SIZE, SIZE), dtype=np.float64)
n_pebbles = 260
for _ in range(n_pebbles):
    cx, cy = rng.integers(0, SIZE, 2)
    r = int(rng.integers(1, 3))
    yy, xx = np.ogrid[-r:r + 1, -r:r + 1]
    keep = (xx ** 2 + yy ** 2 <= r * r)
    y0, y1 = max(0, cy - r), min(SIZE, cy + r + 1)
    x0, x1 = max(0, cx - r), min(SIZE, cx + r + 1)
    keep = keep[: y1 - y0, : x1 - x0]
    gravel_mask[y0:y1, x0:x1] = np.maximum(gravel_mask[y0:y1, x0:x1], keep * rng.uniform(0.5, 1.0))

height = (cloud * 0.45 + fine * 0.25 + trowel * 0.20 + gravel_mask * 0.10)
height = (height - height.min()) / (height.max() - height.min() + 1e-9)

# ---- Albedo: warm architectural white with mottle + gravel specks ----
base = np.array([232, 230, 224], dtype=np.float64)     # warm white cement
shade = 1.0 - (1.0 - height) * 0.16                    # mottling darkens dips
albedo = base[None, None, :] * shade[:, :, None]
# gravel specks: slightly darker/greyer pebbles
speck = (gravel_mask > 0.05)[:, :, None]
albedo = albedo * (1 - speck * 0.10) + np.array([205, 203, 198])[None, None, :] * (speck * 0.10)
# very subtle warm stains (a few soft blotches)
stain = fbm((SIZE, SIZE), 2, 4.0, 1)
stain = np.clip(stain - 0.62, 0, 1)[:, :, None] * 0.5
albedo = albedo * (1 - stain * 0.12) + np.array([214, 205, 188])[None, None, :] * (stain * 0.12)
albedo = np.clip(albedo, 0, 255).astype(np.uint8)

# ---- Normal map from the heightfield (Sobel, OpenGL +Y) ----
h = height.astype(np.float64)
dx = np.zeros_like(h); dy = np.zeros_like(h)
dx[:, 1:-1] = (h[:, 2:] - h[:, :-2]) * 0.5
dx[:, 0] = dx[:, 1]; dx[:, -1] = dx[:, -2]
dy[1:-1, :] = (h[2:, :] - h[:-2, :]) * 0.5
dy[0, :] = dy[1, :]; dy[-1, :] = dy[-2, :]
strength = 2.2
nx = -dx * strength
ny = -dy * strength     # OpenGL convention (green up)
nz = np.ones_like(h)
norm = np.dstack([nx, ny, nz])
l = np.sqrt((norm ** 2).sum(axis=2, keepdims=True))
norm = (norm / l * 0.5 + 0.5) * 255.0
normal = np.clip(norm, 0, 255).astype(np.uint8)

# ---- Roughness: matte cement ~0.78, gravel a touch glossier ----
rough = 0.80 - fine * 0.10 - gravel_mask * 0.14 + (1 - cloud) * 0.04
rough = np.clip(rough, 0.55, 0.95)
roughness = (rough * 255).astype(np.uint8)

Image.fromarray(albedo).save(os.path.join(OUT, 'white_concrete_alb.jpg'), quality=90)
Image.fromarray(normal).save(os.path.join(OUT, 'white_concrete_nrm.jpg'), quality=90)
Image.fromarray(roughness).save(os.path.join(OUT, 'white_concrete_rgh.jpg'), quality=90)
print('OK — wrote white_concrete_{alb,nrm,rgh}.jpg 512x512')
