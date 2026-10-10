#!/usr/bin/env python3
"""KFS asset pipeline: extract maple textures from GLB, generate normal maps
from photo textures, resize, and deploy everything to public/game/."""
import json, struct, os, io, sys
from PIL import Image
import numpy as np

SRC = '/home/z/kfs-assets'
DST = '/home/z/my-project/public/game'

def glb_json_chunks(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'glTF'
    total = struct.unpack('<I', data[8:12])[0]
    off = 12
    chunks = []
    while off < total:
        clen, ctype = struct.unpack('<II', data[off:off+8])
        chunks.append((ctype, data[off+8:off+8+clen]))
        off += 8 + clen
    js = json.loads(chunks[0][1].decode('utf-8'))
    bin_data = None
    for ctype, cdata in chunks[1:]:
        if ctype == 0x004E4942:  # BIN
            bin_data = cdata
    return js, bin_data

def extract_images(glb_path, out_dir, prefix):
    """Extract embedded images, resolving bufferView -> binary chunk."""
    js, bin_data = glb_json_chunks(glb_path)
    os.makedirs(out_dir, exist_ok=True)
    # bufferView byte offsets
    views = js.get('bufferViews', [])
    out = {}
    for i, img in enumerate(js.get('images', [])):
        mime = img.get('mimeType', 'image/png')
        ext = 'jpg' if 'jpeg' in mime else 'png'
        bv = views[img['bufferView']]
        start = bv.get('byteOffset', 0)
        end = start + bv['byteLength']
        raw = bin_data[start:end]
        # gltf bufferViews are 4-byte aligned but may have padding at end
        try:
            im = Image.open(io.BytesIO(raw))
            im.load()
        except Exception:
            # try trimming padding
            im = None
            for trim in range(1, 16):
                try:
                    im = Image.open(io.BytesIO(raw[:-trim]))
                    im.load()
                    break
                except Exception:
                    continue
            if im is None:
                print(f"  ! could not decode image {i} in {os.path.basename(glb_path)}")
                continue
        name = img.get('name', f'image_{i}')
        safe = f"{prefix}_{i}_{name}" if name else f"{prefix}_{i}"
        safe = ''.join(c if c.isalnum() or c in '-_' else '_' for c in safe)
        path = os.path.join(out_dir, f"{safe}.{ext}")
        im.save(path)
        out[safe] = path
        print(f"  + {os.path.basename(path)} {im.size} {im.mode}")
    # Report material -> texture assignments
    texs = js.get('textures', [])
    for mi, mat in enumerate(js.get('materials', [])):
        pbr = mat.get('pbrMetallicRoughness', {})
        bc = pbr.get('baseColorTexture', {}).get('index')
        nrm = mat.get('normalTexture', {}).get('index')
        print(f"  mat '{mat.get('name')}': baseColor=tex{bc} normal=tex{nrm}")
    for ti, t in enumerate(texs):
        print(f"    tex{ti} -> image{t.get('source')} ({t.get('name','')})")
    return out

def make_normal_map(img, strength=2.2, blur=1):
    """Generate a tangent-space normal map from a photo (luminance as height)."""
    g = img.convert('L')
    if g.width > 1024:
        g = g.resize((1024, int(1024 * g.height / g.width)), Image.LANCZOS)
    if blur > 0:
        from PIL import ImageFilter
        g = g.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(g, dtype=np.float32) / 255.0
    # Sobel gradients
    gx = np.zeros_like(a); gz = np.zeros_like(a)
    gx[:, 1:-1] = a[:, 2:] - a[:, :-2]
    gz[1:-1, :] = a[2:, :] - a[:-2, :]
    nx = -gx * strength
    ny = -gz * strength
    nz = np.ones_like(a)
    ln = np.sqrt(nx*nx + ny*ny + nz*nz)
    nx /= ln; ny /= ln; nz /= ln
    out = np.dstack([
        ((nx * 0.5 + 0.5) * 255).astype(np.uint8),
        ((ny * 0.5 + 0.5) * 255).astype(np.uint8),
        ((nz * 0.5 + 0.5) * 255).astype(np.uint8),
    ])
    return Image.fromarray(out, 'RGB')

def make_rough_map(img, invert=False, lo=0.55, hi=0.95):
    """Roughness from inverted luminance variance: dark crevices = rougher."""
    g = img.convert('L')
    if g.width > 1024:
        g = g.resize((1024, int(1024 * g.height / g.width)), Image.LANCZOS)
    a = np.asarray(g, dtype=np.float32) / 255.0
    r = 1.0 - a  # bright highlights slightly smoother
    if invert: r = a
    r = lo + (hi - lo) * (r - r.min()) / max(1e-5, (r.max() - r.min()))
    return Image.fromarray((np.clip(r, 0, 1) * 255).astype(np.uint8), 'L')

# ------------------------------------------------------------------ run
os.makedirs(f'{DST}/textures', exist_ok=True)
os.makedirs(f'{DST}/models', exist_ok=True)
os.makedirs(f'{DST}/audio', exist_ok=True)

print('== 1. Extract maple tree textures ==')
extract_images(f'{SRC}/maple_tree.glb', f'{DST}/textures', 'maple')

print('== 2. Process photo textures -> albedo (jpg) + normal (png) + rough ==')
photos = {
    'Piedra.JPG': 'stone_wall',
    'Adoquines.JPG': 'cobblestone',
    'Madera.JPG': 'wood',
    'Tierra.JPG': 'dirt',
    'Pasto.JPG': 'grass',
    'Tejas.JPG': 'roof_tiles',
    'Piso_Castillo.JPG': 'castle_floor',
    'Mazmorra.JPG': 'dungeon_stone',
}
for src, name in photos.items():
    img = Image.open(f'{SRC}/{src}')
    # albedo: resize to max 1024, keep as jpg
    if img.width > 1024 or img.height > 1024:
        img = img.resize((1024, int(1024 * img.height / img.width)), Image.LANCZOS) if img.width >= img.height else img.resize((int(1024 * img.width / img.height), 1024), Image.LANCZOS)
    img.convert('RGB').save(f'{DST}/textures/{name}_alb.jpg', quality=82)
    # normal
    nm = make_normal_map(img, strength=2.0)
    nm.save(f'{DST}/textures/{name}_nrm.png')
    # roughness for a few key materials
    if name in ('stone_wall', 'cobblestone', 'wood', 'roof_tiles', 'castle_floor', 'dungeon_stone'):
        make_rough_map(img, lo=0.62, hi=0.96).save(f'{DST}/textures/{name}_rgh.png')
    print(f'  + {name}: albedo {img.size} + normal')

print('== 3. Copy GLB models ==')
import shutil
models = {
    'black_dragon_with_idle_animation.glb': 'black_dragon.glb',
    'knight_-_includes_file_for_3d_printing.glb': 'knight_statue.glb',
    'lowpoly_medieval_game_assets_set.glb': 'medieval_props.glb',
    'maple_tree.glb': 'maple_tree.glb',
    'medieval_props_minipack_2_-_furniture.glb': 'furniture.glb',
    'pirate_ship.glb': 'pirate_ship.glb',
}
for src, dst in models.items():
    shutil.copy(f'{SRC}/{src}', f'{DST}/models/{dst}')
    print(f'  + models/{dst}')

print('== 4. Copy music ==')
shutil.copy(f'{SRC}/Musica_fondo1.mp3', f'{DST}/audio/ambient_sea.mp3')
shutil.copy(f'{SRC}/Musica_fondo2.mp3', f'{DST}/audio/ambient_tavern.mp3')
print('  + audio/ambient_sea.mp3 (3:20)')
print('  + audio/ambient_tavern.mp3 (3:07)')

print('== DONE ==')
for root, dirs, files in os.walk(DST):
    for f in sorted(files):
        p = os.path.join(root, f)
        print(f'  {os.path.relpath(p, DST):40} {os.path.getsize(p)/1024:8.1f} KB')
