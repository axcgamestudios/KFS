#!/usr/bin/env python3
"""Fase 16 — generate the WHITE CONCRETE PBR set (alb/nrm/rgh).

The user said the texture file was 'added to the repository', but it is not
in the repo, the KFS folder, or any upload. This script synthesises a
seamless, photo-style white concrete matching the look of the other PBR
sets (large soft mottling + fine aggregate speckle + faint stains), and
writes:
  public/game/textures/white_concrete_alb.jpg
  public/game/textures/white_concrete_nrm.jpg
  public/game/textures/white_concrete_rgh.jpg
  KFS/Concreto_Blanco.JPG   (repo naming, like the user's other textures)
"""
import numpy as np
from PIL import Image
import os

SIZE = 512
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def periodic_value_noise(freq, seed):
    """Tileable value noise at integer frequency `freq` (bilinear + smooth)."""
    rng = np.random.default_rng(seed)
    g = rng.random((freq, freq))
    # upsample to SIZE with bilinear interpolation, periodic wrap
    ys = (np.arange(SIZE) * freq / SIZE) % freq
    xs = (np.arange(SIZE) * freq / SIZE) % freq
    y0 = np.floor(ys).astype(int) % freq
    x0 = np.floor(xs).astype(int) % freq
    y1 = (y0 + 1) % freq
    x1 = (x0 + 1) % freq
    fy = (ys - np.floor(ys)) ** 2 * (3 - 2 * (ys - np.floor(ys)))
    fx = (xs - np.floor(xs)) ** 2 * (3 - 2 * (xs - np.floor(xs)))
    fy = fy[:, None]
    fx = fx[None, :]
    top = g[y0][:, x0] * (1 - fx) + g[y0][:, x1] * fx
    bot = g[y1][:, x0] * (1 - fx) + g[y1][:, x1] * fx
    return top * (1 - fy) + bot * fy


def main():
    # --- albedo: white concrete, soft blotching + fine aggregate ---
    large = (periodic_value_noise(4, 11) - 0.5) * 0.06
    mid = (periodic_value_noise(13, 23) - 0.5) * 0.035
    fine = (periodic_value_noise(47, 37) - 0.5) * 0.05
    # sparse darker stains (weathering), very subtle
    stain = np.clip(periodic_value_noise(3, 51) - 0.62, 0, 1) * 0.05
    base = 0.93  # near-white concrete
    alb = base + large + mid * 0.6 + fine * 0.5 - stain
    alb = np.clip(alb, 0.82, 0.99)

    # fine speckle: a few percent of pixels are aggregate dots (darker)
    rng = np.random.default_rng(77)
    speck = rng.random((SIZE, SIZE))
    alb = np.where(speck > 0.988, alb - 0.10, alb)
    alb = np.where(speck < 0.006, alb + 0.05, alb)

    # subtle trowel banding (very low contrast horizontal panels)
    band = np.sin(np.arange(SIZE)[:, None] / SIZE * 2 * np.pi * 6) * 0.006
    alb = np.clip(alb + band, 0.82, 0.99)

    alb_img = Image.fromarray((alb * 255).astype(np.uint8), mode='L').convert('RGB')

    # --- height/normal: from the same octaves (smooth, low amplitude) ---
    height = large * 6 + mid * 3 + fine * 1.2 + (speck > 0.988) * -2.0
    gy, gx = np.gradient(height)
    gx = np.clip(gx * 3.2, -1, 1)
    gy = np.clip(gy * 3.2, -1, 1)
    nz = np.ones((SIZE, SIZE))
    inv = 1.0 / np.sqrt(gx**2 + gy**2 + nz**2)
    nx = gx * inv * 0.5 + 0.5
    ny = gy * inv * 0.5 + 0.5
    nzv = nz * inv * 0.5 + 0.5
    nrm = np.stack([nx * 255, ny * 255, nzv * 255], axis=-1).astype(np.uint8)
    nrm_img = Image.fromarray(nrm, mode='RGB')

    # --- roughness: satin concrete, slight patchiness, speckle smoother ---
    rgh = 0.82 - mid * 0.9 - (speck > 0.988) * 0.18 + fine * 0.4
    rgh = np.clip(rgh, 0.62, 0.97)
    rgh_img = Image.fromarray((rgh * 255).astype(np.uint8), mode='L')

    tex = os.path.join(ROOT, 'public', 'game', 'textures')
    os.makedirs(tex, exist_ok=True)
    alb_img.save(os.path.join(tex, 'white_concrete_alb.jpg'), quality=92)
    nrm_img.save(os.path.join(tex, 'white_concrete_nrm.jpg'), quality=92)
    rgh_img.save(os.path.join(tex, 'white_concrete_rgh.jpg'), quality=92)

    # repo-named copy for the user's KFS texture folder
    kfs = os.path.join(ROOT, 'KFS')
    if os.path.isdir(kfs):
        alb_img.save(os.path.join(kfs, 'Concreto_Blanco.JPG'), quality=90)

    print('OK white_concrete 512x512 ->', tex)
    print('avg alb RGB:', tuple(np.asarray(alb_img).reshape(-1, 3).mean(0).round(1)))


if __name__ == '__main__':
    main()
