#!/usr/bin/env python3
"""Fase 21 — build the white_concrete PBR set from the USER'S PHOTO
(Concreto.JPG, 1024x1024) instead of the old procedural placeholder.

Outputs (512x512, seamless):
  white_concrete_alb.jpg — white-balanced, de-lit, tileable albedo
  white_concrete_nrm.jpg — normal map from the de-lit heightfield (Sobel)
  white_concrete_rgh.jpg — roughness from local micro-variance + stains
"""
import numpy as np
from PIL import Image, ImageFilter
import sys

SRC = '/tmp/kfs_upload/Concreto.JPG'
OUT = '/home/z/my-project/public/game/textures'
SIZE = 512

img = Image.open(SRC).convert('RGB')
# center-crop to square (photo edges often carry perspective/vignetting)
w, h = img.size
side = int(min(w, h) * 0.92)
img = img.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
img = img.resize((SIZE, SIZE), Image.LANCZOS)
a = np.asarray(img).astype(np.float32) / 255.0

# ---------- 1. de-light: remove the large-scale lighting (keep the grain) ----------
lum = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
# low-pass = lighting/shading; high-pass = surface detail
low = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18)), dtype=np.float32) / 255.0
detail = lum - low  # signed detail
flat = lum / np.maximum(low, 0.05)  # illumination-normalized surface

# ---------- 2. make it TILEABLE (offset-mirror blend): ----------
def tileable(plane: np.ndarray) -> np.ndarray:
    """Blend the plane with itself flipped so opposite edges match:
    result = plane*(1-w) + flipped*w with a smooth edge weight."""
    flipped = np.flip(np.flip(plane, 0), 1)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    # weight grows to 1 near all four borders (0.5 → band)
    band = 0.18
    wx = np.minimum(xx, SIZE - 1 - xx) / (SIZE * band)
    wy = np.minimum(yy, SIZE - 1 - yy) / (SIZE * band)
    wgt = 1.0 - np.clip(np.minimum(wx, wy), 0, 1)  # 1 at the border, 0 inside
    wgt = (wgt ** 2)
    return plane * (1 - wgt) + flipped * wgt

flat_t = tileable(flat)
det_t = tileable(detail)

# ---------- 3. white balance: push the median to clean warm white ----------
med = np.median(flat_t)
target = 0.82  # bright white concrete (albedo, not full white: keeps shading headroom)
gain = target / max(med, 0.05)
flat_t = np.clip(flat_t * gain, 0, 1)

# per-channel balance (kill yellow/blue casts): scale each channel so its
# median matches the same target
alb = np.zeros((SIZE, SIZE, 3), dtype=np.float32)
for c in range(3):
    ch = a[:, :, c] / np.maximum(low, 0.05)
    ch = tileable(ch)
    cm = np.median(ch)
    alb[:, :, c] = np.clip(ch * (target / max(cm, 0.05)), 0, 1)

# neutralize any residual cast: average channels toward their mean slightly
mean_rgb = alb.reshape(-1, 3).mean(axis=0)
grey = mean_rgb.mean()
alb = np.clip(alb + (grey - mean_rgb) * 0.45, 0, 1)

# re-inject a touch of the fine grain so the surface doesn't go plastic
alb = np.clip(alb + det_t[:, :, None] * 0.06, 0, 1)

# ---------- 4. normal map from the de-lit height ----------
hgt = flat_t - flat_t.mean()
hgt = tileable(hgt)
# blur the height a hair so single-pixel noise doesn't shimmer
h_img = Image.fromarray(((hgt - hgt.min()) / max(float(np.ptp(hgt)), 1e-6) * 255).astype(np.uint8))
h_img = h_img.filter(ImageFilter.GaussianBlur(0.6))
hf = np.asarray(h_img, dtype=np.float32) / 255.0
# Sobel
gx = np.zeros_like(hf); gy = np.zeros_like(hf)
gx[1:-1, 1:-1] = (hf[1:-1, 2:] - hf[1:-1, :-2]) * 2 + (hf[2:, 2:] - hf[2:, :-2]) + (hf[:-2, 2:] - hf[:-2, :-2])
gy[1:-1, 1:-1] = (hf[2:, 1:-1] - hf[:-2, 1:-1]) * 2 + (hf[2:, 2:] - hf[:-2, 2:]) + (hf[2:, :-2] - hf[:-2, :-2])
strength = 2.2
n = np.zeros((SIZE, SIZE, 3), dtype=np.float32)
n[:, :, 0] = np.clip(0.5 - gx * strength * 0.5, 0, 1)
n[:, :, 1] = np.clip(0.5 - gy * strength * 0.5, 0, 1)
n[:, :, 2] = 1.0 / np.sqrt(1 + (gx * strength) ** 2 + (gy * strength) ** 2)
n[:, :, 2] = np.clip(n[:, :, 2], 0, 1)
# renormalize to unit length
ln = np.sqrt((n ** 2).sum(axis=2, keepdims=True))
n = n / ln

# ---------- 5. roughness: micro-variance + stain darkness ----------
# rougher where the grain is strong, smoother in the flat patches
var = np.abs(det_t)
var = tileable(var)
var_img = Image.fromarray((var * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
var_s = np.asarray(var_img, dtype=np.float32) / 255.0
rgh = np.clip(0.78 + var_s * 0.5 - (flat_t - target) * 0.25, 0.55, 0.98)

# ---------- save ----------
Image.fromarray((alb * 255).astype(np.uint8)).save(f'{OUT}/white_concrete_alb.jpg', quality=90)
Image.fromarray((n * 255).astype(np.uint8)).save(f'{OUT}/white_concrete_nrm.jpg', quality=92)
Image.fromarray((rgh * 255).astype(np.uint8)).save(f'{OUT}/white_concrete_rgh.jpg', quality=88)
print('wrote white_concrete_{alb,nrm,rgh}.jpg (from the user photo, 512x512 tileable)')

# preview strip for QA
prev = np.concatenate([alb, np.tile(n[:, :, :3][:, :, :3], (1, 1, 1)), np.stack([rgh]*3, axis=2)], axis=1)
Image.fromarray((prev * 255).astype(np.uint8)).save('/tmp/kfs_concrete_preview.jpg')
print('preview: /tmp/kfs_concrete_preview.jpg')
