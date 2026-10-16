#!/usr/bin/env python3
"""F28 v2 — THE SURGERY (image-preserving): remove shield/sword remnants from
knight_rigged.glb while keeping the 6 embedded texture images byte-exact."""
import json, struct, shutil
import numpy as np

SRC = '/home/z/my-project/public/game/models/knight_rigged.glb'
BAK = '/home/z/my-project/scripts/knight_rigged.glb.bak'
NPZ = '/home/z/my-project/scripts/shots_f28/f28_kill_classes.npz'

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data[bin_off+8:bin_off+8+bin_len]

TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}

def read_raw(gltf, buf, acc_idx):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    comp = TYPES[acc['type']]
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[acc['componentType']]
    count, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    stride = bv.get('byteStride', 0) or struct.calcsize('<'+fmt)*comp
    out = np.empty((count, comp), dtype=np.float64)
    for k in range(count):
        po = off + k*stride
        if comp == 3 and acc['componentType'] == 5126: out[k] = struct.unpack_from('<3f', buf, po)
        elif comp == 2 and acc['componentType'] == 5126: out[k] = struct.unpack_from('<2f', buf, po)
        elif comp == 4 and acc['componentType'] == 5121: out[k] = struct.unpack_from('<4B', buf, po)
        elif comp == 4 and acc['componentType'] == 5123: out[k] = struct.unpack_from('<4H', buf, po)
        elif comp == 4 and acc['componentType'] == 5126: out[k] = struct.unpack_from('<4f', buf, po)
        elif comp == 1 and acc['componentType'] == 5125: out[k] = struct.unpack_from('<I', buf, po)[0]
        elif comp == 1 and acc['componentType'] == 5123: out[k] = struct.unpack_from('<H', buf, po)[0]
        elif comp == 16 and acc['componentType'] == 5126: out[k] = struct.unpack_from('<16f', buf, po)
        else:
            out[k] = struct.unpack_from('<' + fmt*comp, buf, po)
    return out

def pack(arr, ct):
    if ct == 5126: return np.asarray(arr, dtype='<f4').tobytes()
    if ct == 5125: return np.asarray(arr, dtype='<u4').tobytes()
    if ct == 5123: return np.asarray(arr, dtype='<u2').tobytes()
    if ct == 5121: return np.asarray(arr, dtype='<u1').tobytes()
    raise ValueError(ct)

# ---------- restore original, then operate ----------
shutil.copy(BAK, SRC)
gltf, buf = load(SRC)
d = np.load(NPZ, allow_pickle=True)

# ---------- kill masks ----------
kill_masks = {}
for mi, mesh in enumerate(gltf['meshes']):
    name = mesh.get('name', f'mesh{mi}')
    p = mesh['primitives'][0]
    pos = read_raw(gltf, buf, p['attributes']['POSITION'])
    kill = np.zeros(len(pos), dtype=bool)
    if name == 'knight_lower':
        kc = d['kill_class']
        kill[d['kill_mask']] = (kc == 'shield_remnant') | (kc == 'hand_or_grip?')
        fc = d['foot_class']
        kill[d['foot_mask']] |= (fc == 'shield_base_junk')
        n1 = kill.sum()
        medial = ((pos[:,0] >= -0.16) & (pos[:,0] < -0.02)
                  & (((pos[:,1] < 0.75) & (pos[:,2] > 0.104))
                     | ((pos[:,1] >= 0.75) & (pos[:,1] < 1.10) & (pos[:,2] > 0.142))))
        kill |= medial
        n2 = kill.sum()
        sweep = (pos[:,0] >= -0.36) & (pos[:,0] < -0.12) & (pos[:,2] > 0.26) & (pos[:,1] < 0.85)
        kill |= sweep
        print(f'knight_lower kill: class {n1} + medial {n2-n1} + sweep {kill.sum()-n2} = {kill.sum()}')
    elif name == 'knight_upper':
        grip = (pos[:,1] >= 0.844) & (pos[:,1] < 0.935) & (pos[:,0] >= -0.36) & (pos[:,0] < -0.12) & (pos[:,2] >= 0.05) & (pos[:,2] < 0.27)
        kill |= grip
        print(f'knight_upper kill: {kill.sum()}')
    kill_masks[mi] = kill

# ---------- rebuild modified meshes ----------
ACC_OF = {}
for mi, kill in kill_masks.items():
    if not kill.any(): continue
    mesh = gltf['meshes'][mi]
    p = mesh['primitives'][0]
    pos = read_raw(gltf, buf, p['attributes']['POSITION'])
    nrm = read_raw(gltf, buf, p['attributes']['NORMAL']) if 'NORMAL' in p['attributes'] else None
    uv = read_raw(gltf, buf, p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else None
    jts = read_raw(gltf, buf, p['attributes']['JOINTS_0']) if 'JOINTS_0' in p['attributes'] else None
    wts = read_raw(gltf, buf, p['attributes']['WEIGHTS_0']) if 'WEIGHTS_0' in p['attributes'] else None
    idx = read_raw(gltf, buf, p['indices']).astype(np.int64).reshape(-1, 3)
    tri_kill = kill[idx].any(axis=1)
    keep_tris = idx[~tri_kill]
    used, remap = np.unique(keep_tris.reshape(-1), return_inverse=True)
    new_idx = remap.reshape(-1, 3)
    subs = {'POSITION': pos[used], 'NORMAL': nrm[used] if nrm is not None else None,
            'TEXCOORD_0': uv[used] if uv is not None else None,
            'JOINTS_0': jts[used] if jts is not None else None,
            'WEIGHTS_0': wts[used] if wts is not None else None}
    for attr, arr in subs.items():
        if attr in p['attributes'] and arr is not None:
            ACC_OF[p['attributes'][attr]] = arr
    ACC_OF[p['indices']] = new_idx
    print(f"{mesh['name']}: -{int(tri_kill.sum())} tris -> {len(used)} verts")

# ---------- assemble new bin: images first (byte-exact), then accessors ----------
new_bin = bytearray()
new_views = []          # list of view dicts
img_view_map = {}       # old view idx -> new view idx
for img in gltf.get('images', []):
    vi = img['bufferView']
    if vi in img_view_map: continue
    bv = gltf['bufferViews'][vi]
    blob = bytes(buf[bv['byteOffset']:bv['byteOffset']+bv['byteLength']])
    off = len(new_bin)
    while off % 4: new_bin.extend(b'\0'); off = len(new_bin)
    img_view_map[vi] = len(new_views)
    new_views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(blob)})
    new_bin.extend(blob)
for img in gltf.get('images', []):
    img['bufferView'] = img_view_map[img['bufferView']]

for ai, acc in enumerate(gltf['accessors']):
    if ai in ACC_OF:
        arr = ACC_OF[ai]
        comp = TYPES[acc['type']]
        if 'max' in acc:
            a2 = np.asarray(arr)
            if comp >= 2:
                acc['max'] = a2.max(axis=0).tolist(); acc['min'] = a2.min(axis=0).tolist()
            else:
                acc['max'] = [float(a2.max())]; acc['min'] = [float(a2.min())]
    else:
        arr = read_raw(gltf, buf, ai)
    acc['count'] = arr.size if acc['type'] == 'SCALAR' else len(arr)
    data = pack(arr, acc['componentType'])
    off = len(new_bin)
    while off % 4: new_bin.extend(b'\0'); off = len(new_bin)
    acc['bufferView'] = len(new_views)
    new_views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    new_bin.extend(data)

gltf['bufferViews'] = new_views
gltf['buffers'][0]['byteLength'] = len(new_bin)

js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
pad = (4 - len(js) % 4) % 4
js += b' ' * pad
total = 12 + 8 + len(js) + 8 + len(new_bin)
with open(SRC, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(new_bin), 0x004E4942)); f.write(bytes(new_bin))
print(f'wrote {SRC}: {total} bytes')

# ---------- audit ----------
g2, b2 = load(SRC)
from collections import Counter
for mi, mesh in enumerate(g2['meshes']):
    p = mesh['primitives'][0]
    pos = read_raw(g2, b2, p['attributes']['POSITION'])
    print(f"{mesh['name']}: {len(pos)} verts")
    if mesh['name'] == 'knight_lower':
        jts = read_raw(g2, b2, p['attributes']['JOINTS_0']).astype(int)
        wts = read_raw(g2, b2, p['attributes']['WEIGHTS_0'])
        jn = [g2['nodes'][j]['name'] for j in g2['skins'][0]['joints']]
        dom = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])
        for bn in ['j_ankleL','j_ankleR','j_kneeL','j_kneeR','j_hipL','j_hipR']:
            m = dom == bn
            if m.sum():
                pp = pos[m]
                print(f"  {bn}: {m.sum()} verts X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]")
# validate with three.js-style sanity: min == max count
print('\nimage views preserved:', len(g2.get('images', [])), 'images;', len(g2['bufferViews']), 'views')
