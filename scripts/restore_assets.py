#!/usr/bin/env python3
"""KFS asset restoration (post-reset). Rebuilds public/game/ from the user's
repo clone: PBR texture sets (alb/nrm/rgh as .jpg — the exact names the
AssetSystem loads), maple textures extracted from maple_tree.glb, terrain
detail, GLB models with target names, and the music tracks."""
import io, json, os, shutil, struct
import numpy as np
from PIL import Image, ImageFilter

SRC = '/tmp/kfs_repo'          # fresh clone of googlesitecom/KFS
DST = '/home/z/my-project/public/game'

os.makedirs(f'{DST}/textures', exist_ok=True)
os.makedirs(f'{DST}/models', exist_ok=True)
os.makedirs(f'{DST}/audio', exist_ok=True)

# ---------------------------------------------------------------- glb images
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
        if ctype == 0x004E4942:
            bin_data = cdata
    return js, bin_data

def extract_images(glb_path):
    js, bin_data = glb_json_chunks(glb_path)
    views = js.get('bufferViews', [])
    out = []
    for i, img in enumerate(js.get('images', [])):
        mime = img.get('mimeType', 'image/png')
        ext = 'jpg' if 'jpeg' in mime else 'png'
        bv = views[img['bufferView']]
        start = bv.get('byteOffset', 0)
        end = start + bv['byteLength']
        raw = bin_data[start:end]
        im = None
        try:
            im = Image.open(io.BytesIO(raw)); im.load()
        except Exception:
            for trim in range(1, 16):
                try:
                    im = Image.open(io.BytesIO(raw[:-trim])); im.load(); break
                except Exception:
                    continue
        if im is None:
            print(f'  ! undecodable image {i}')
            continue
        out.append((i, img.get('name', ''), ext, im))
    return out

print('== 1. Maple textures from maple_tree.glb ==')
imgs = extract_images(f'{SRC}/maple_tree.glb')
bark, leaf = None, None
for i, name, ext, im in imgs:
    print(f'  image{i} "{name}" {im.size} {im.mode} .{ext}')
    low = (name or '').lower()
    a = np.asarray(im.convert('RGB'), dtype=np.float32)
    greenness = float(a[:, :, 1].mean() - (a[:, :, 0].mean() + a[:, :, 2].mean()) / 2)
    if ext == 'jpg' and bark is None:
        bark = im            # jpeg = bark in this asset
    elif 'leaf' in low or (greenness > 4 and leaf is None):
        leaf = im
if bark is None or leaf is None:
    for i, name, ext, im in imgs:
        if bark is None: bark = im
        elif leaf is None: leaf = im
if bark is not None:
    if bark.width > 1024:
        bark = bark.resize((1024, int(1024 * bark.height / bark.width)), Image.LANCZOS)
    bark.convert('RGB').save(f'{DST}/textures/maple_bark.jpg', quality=86)
    print('  + maple_bark.jpg')
if leaf is not None:
    if leaf.width > 1024:
        leaf = leaf.resize((1024, int(1024 * leaf.height / leaf.width)), Image.LANCZOS)
    leaf.save(f'{DST}/textures/maple_leaf.png')
    print('  + maple_leaf.png')

# ---------------------------------------------------------------- pbr sets
def make_normal_map(img, strength=2.0, blur=1):
    g = img.convert('L')
    if g.width > 1024:
        g = g.resize((1024, int(1024 * g.height / g.width)), Image.LANCZOS)
    if blur > 0:
        g = g.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(g, dtype=np.float32) / 255.0
    gx = np.zeros_like(a); gz = np.zeros_like(a)
    gx[:, 1:-1] = a[:, 2:] - a[:, :-2]
    gz[1:-1, :] = a[2:, :] - a[:-2, :]
    nx = -gx * strength; ny = -gz * strength; nz = np.ones_like(a)
    ln = np.sqrt(nx*nx + ny*ny + nz*nz)
    nx /= ln; ny /= ln; nz /= ln
    return Image.fromarray(np.dstack([
        ((nx*0.5+0.5)*255).astype(np.uint8),
        ((ny*0.5+0.5)*255).astype(np.uint8),
        ((nz*0.5+0.5)*255).astype(np.uint8)]), 'RGB')

def make_rough_map(img, lo=0.62, hi=0.96):
    g = img.convert('L')
    if g.width > 1024:
        g = g.resize((1024, int(1024 * g.height / g.width)), Image.LANCZOS)
    a = np.asarray(g, dtype=np.float32) / 255.0
    r = 1.0 - a
    r = lo + (hi - lo) * (r - r.min()) / max(1e-5, (r.max() - r.min()))
    return Image.fromarray((np.clip(r, 0, 1) * 255).astype(np.uint8), 'L')

print('== 2. Photo PBR sets -> _alb.jpg / _nrm.jpg / _rgh.jpg ==')
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
rough_names = {'stone_wall', 'cobblestone', 'wood', 'roof_tiles', 'castle_floor', 'dungeon_stone'}
for src, name in photos.items():
    img = Image.open(f'{SRC}/{src}')
    if img.width > 1024 or img.height > 1024:
        img = img.resize((1024, int(1024*img.height/img.width)), Image.LANCZOS) if img.width >= img.height \
            else img.resize((int(1024*img.width/img.height), 1024), Image.LANCZOS)
    img.convert('RGB').save(f'{DST}/textures/{name}_alb.jpg', quality=84)
    make_normal_map(img, strength=2.0).save(f'{DST}/textures/{name}_nrm.jpg', quality=84)
    if name in rough_names:
        make_rough_map(img).save(f'{DST}/textures/{name}_rgh.jpg', quality=84)
    print(f'  + {name}: alb/nrm' + ('/rgh' if name in rough_names else ''))

print('== 3. Terrain detail (tileable fine grain from Pasto) ==')
g = Image.open(f'{SRC}/Pasto.JPG').convert('L').resize((512, 512), Image.LANCZOS)
a = np.asarray(g, dtype=np.float32) / 255.0
rng = np.random.default_rng(7)
noise = rng.normal(0, 0.09, a.shape)
det = np.clip((a - a.mean()) * 0.6 + 0.5 + noise, 0, 1)
Image.fromarray((det * 255).astype(np.uint8), 'L').save(f'{DST}/textures/terrain_detail.jpg', quality=85)
print('  + terrain_detail.jpg')

print('== 4. GLB models ==')
models = {
    'black_dragon_with_idle_animation.glb': 'black_dragon.glb',
    'knight_-_includes_file_for_3d_printing.glb': 'knight_statue.glb',
    'lowpoly_medieval_game_assets_set.glb': 'medieval_props.glb',
    'maple_tree.glb': 'maple_tree.glb',
    'medieval_props_minipack_2_-_furniture.glb': 'furniture.glb',
    'pirate_ship.glb': 'pirate_ship.glb',
    'fuse_civilian_2.glb': 'fuse_civilian_2.glb',
}
for src, dst in models.items():
    shutil.copy(f'{SRC}/{src}', f'{DST}/models/{dst}')
    print(f'  + models/{dst} ({os.path.getsize(f"{DST}/models/{dst}")/1e6:.1f} MB)')

print('== 5. Music ==')
shutil.copy(f'{SRC}/Musica_fondo1.mp3', f'{DST}/audio/menu_theme.mp3')
shutil.copy(f'{SRC}/Musica_fondo2.mp3', f'{DST}/audio/ambient_sea.mp3')
shutil.copy(f'{SRC}/Musica_fondo2.mp3', f'{DST}/audio/ambient_tavern.mp3')
print('  + menu_theme.mp3 / ambient_sea.mp3 / ambient_tavern.mp3')

print('== DONE ==')
total = 0
for root, dirs, files in os.walk(DST):
    for f in sorted(files):
        p = os.path.join(root, f)
        sz = os.path.getsize(p)
        total += sz
        print(f'  {os.path.relpath(p, DST):34} {sz/1024:9.1f} KB')
print(f'TOTAL: {total/1e6:.1f} MB')
