#!/usr/bin/env python3
"""F28 — THE SURGERY: remove all shield/sword remnants from knight_rigged.glb.

Kill sets on knight_lower:
  L1. class mask: shield_remnant (3042) + hand_or_grip (83)  [from npz]
  L2. shield_base_junk (34)                                   [from npz]
  L3. medial extension: x in [-0.16,-0.02] & (y<0.75 & z>0.104 | y>=0.75 & z>0.142)
      — the shield back-plate's medial edge (dominant j_hipL/j_kneeL, z 0.24-0.32)
  L4. sword-fragment sweep: x in [-0.36,-0.12] & z>0.26 & y<0.85
      — nothing legit there (tassets stay x>-0.114 at that z)
Kill set on knight_upper:
  U1. sword grip column below the right hand: y in [0.844,0.935] & x in [-0.36,-0.12] & z in [0.05,0.27]
      (the hand itself is y>=0.94; below it only the planted sword's grip/blade remains)

Triangle rule: drop any triangle with >=1 kill vert. Drop orphaned verts.
Everything else (bones, materials, props, skin) byte-identical.
"""
import json, struct, shutil
import numpy as np

SRC = '/home/z/my-project/public/game/models/knight_rigged.glb'
BAK = '/home/z/my-project/scripts/knight_rigged.glb.bak'

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data[bin_off+8:bin_off+8+bin_len]

def read_raw(gltf, buf, acc_idx):
    """read accessor as raw float/int array (n, comp)"""
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
    comp = TYPES[acc['type']]
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[acc['componentType']]
    count, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    stride = bv.get('byteStride', 0) or struct.calcsize('<'+fmt)*comp
    out = np.empty((count, comp), dtype=np.float64)
    for k in range(count):
        po = off + k*stride
        if comp == 3: out[k] = struct.unpack_from('<3f', buf, po)
        elif comp == 4:
            if acc['componentType'] == 5121: out[k] = struct.unpack_from('<4B', buf, po)
            elif acc['componentType'] == 5123: out[k] = struct.unpack_from('<4H', buf, po)
            else: out[k] = struct.unpack_from('<4f', buf, po)
        elif comp == 2: out[k] = struct.unpack_from('<2f', buf, po)
        elif comp == 1:
            if acc['componentType'] == 5125: out[k] = struct.unpack_from('<I', buf, po)[0]
            elif acc['componentType'] == 5123: out[k] = struct.unpack_from('<H', buf, po)[0]
            else: out[k] = struct.unpack_from('<'+fmt, buf, po)[0]
        elif comp == 16: out[k] = struct.unpack_from('<16f', buf, po)
        else:
            raw = struct.unpack_from('<' + fmt*comp, buf, po)
            out[k] = raw
    return out

gltf, buf = load(SRC)
shutil.copy(SRC, BAK)

d = np.load('/home/z/my-project/scripts/shots_f28/f28_kill_classes.npz', allow_pickle=True)

# ---------------- build per-mesh kill masks ----------------
kill_masks = {}   # mesh_idx -> boolean vert mask
reports = []

for mi, mesh in enumerate(gltf['meshes']):
    name = mesh.get('name', f'mesh{mi}')
    p = mesh['primitives'][0]
    pos = read_raw(gltf, buf, p['attributes']['POSITION'])
    n = len(pos)
    kill = np.zeros(n, dtype=bool)
    if name == 'knight_lower':
        kc = d['kill_class']
        kill[d['kill_mask']] = (kc == 'shield_remnant') | (kc == 'hand_or_grip?')
        fc = d['foot_class']
        kill[d['foot_mask']] |= (fc == 'shield_base_junk')
        n1 = kill.sum()
        # L3 medial extension
        medial = ((pos[:,0] >= -0.16) & (pos[:,0] < -0.02)
                  & (((pos[:,1] < 0.75) & (pos[:,2] > 0.104))
                     | ((pos[:,1] >= 0.75) & (pos[:,1] < 1.10) & (pos[:,2] > 0.142))))
        kill |= medial
        n2 = kill.sum()
        # L4 sword sweep
        sweep = (pos[:,0] >= -0.36) & (pos[:,0] < -0.12) & (pos[:,2] > 0.26) & (pos[:,1] < 0.85)
        kill |= sweep
        reports.append(f'knight_lower: class {n1} + medial {n2-n1} + swordsweep {kill.sum()-n2} = {kill.sum()} kill verts of {n}')
    elif name == 'knight_upper':
        # U1: grip column below the right hand
        grip = (pos[:,1] >= 0.844) & (pos[:,1] < 0.935) & (pos[:,0] >= -0.36) & (pos[:,0] < -0.12) & (pos[:,2] >= 0.05) & (pos[:,2] < 0.27)
        kill |= grip
        reports.append(f'knight_upper: grip column {kill.sum()} kill verts of {n}')
    else:
        reports.append(f'{name}: untouched')
    kill_masks[mi] = kill

print('\n'.join(reports))

# ---------------- rebuild the meshes ----------------
def rebuild_mesh(mi, kill):
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
    new_idx = remap.reshape(-1, 3).astype(np.uint32)
    def take(a): return a[used] if a is not None else None
    return dict(pos=take(pos), nrm=take(nrm), uv=take(uv), jts=take(jts), wts=take(wts), idx=new_idx,
                dropped_tris=int(tri_kill.sum()), kept_verts=len(used))

new_meshes = {}
for mi, kill in kill_masks.items():
    if not kill.any(): continue
    new_meshes[mi] = rebuild_mesh(mi, kill)
    r = new_meshes[mi]
    print(f"mesh {mi} ({gltf['meshes'][mi]['name']}): dropped {r['dropped_tris']} tris, {r['kept_verts']} verts remain")

# ---------------- write the new GLB ----------------
# Strategy: keep the original gltf JSON structure; rewrite the BIN buffer and
# the accessors of modified meshes. Simpler: rebuild the WHOLE buffer from
# scratch in a canonical layout per accessor, updating bufferView offsets.

def pack_accessor(arr, componentType, dtype_fmt):
    """arr (n, comp) -> bytes in the given componentType"""
    if componentType in (5126,):
        return arr.astype('<f4').tobytes()
    if componentType == 5125:
        return arr.astype('<u4').tobytes()
    if componentType == 5123:
        return arr.astype('<u2').tobytes()
    if componentType == 5121:
        return arr.astype('<u1').tobytes()
    raise ValueError(componentType)

# Assemble new bin: iterate all accessors; for those belonging to modified meshes,
# substitute new data; everyone else keeps original bytes.
new_bin = bytearray()
view_remap = {}   # bufferView idx -> (offset, length)
ACC_OF = {}       # accessor idx -> new data array or None (keep original)

for mi, r in new_meshes.items():
    p = gltf['meshes'][mi]['primitives'][0]
    subs = {'POSITION': r['pos'], 'NORMAL': r['nrm'], 'TEXCOORD_0': r['uv'],
            'JOINTS_0': r['jts'], 'WEIGHTS_0': r['wts']}
    for attr, arr in subs.items():
        if attr in p['attributes'] and arr is not None:
            ACC_OF[p['attributes'][attr]] = arr
    ACC_OF[p['indices']] = r['idx']

# build bufferViews: one per accessor that needs rewriting, reuse for originals
# Simplest correct approach: rebuild EVERY accessor's bufferView.
for ai, acc in enumerate(gltf['accessors']):
    bv = gltf['bufferViews'][acc['bufferView']]
    if ai in ACC_OF:
        arr = ACC_OF[ai]
        data = pack_accessor(arr, acc['componentType'], None)
        comp = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[acc['type']]
        acc['count'] = len(arr)
        if 'max' in acc and comp == 3:
            a2 = np.asarray(arr); acc['max'] = a2.max(axis=0).tolist(); acc['min'] = a2.min(axis=0).tolist()
        elif 'max' in acc:
            a2 = np.asarray(arr); acc['max'] = [float(a2.max())]; acc['min'] = [float(a2.min())]
    else:
        # original slice
        off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
        TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
        comp = TYPES[acc['type']]
        fmt = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[acc['componentType']]
        stride = bv.get('byteStride', 0) or comp*fmt
        data = bytes(buf[off:off+acc['count']*stride])
        # strip stride padding: repack tightly
        arr = np.empty((acc['count'], comp))
        for k in range(acc['count']):
            base = k*stride
            for c in range(comp):
                chunk = data[base+c*fmt:base+(c+1)*fmt]
                if acc['componentType'] == 5126: arr[k,c] = struct.unpack('<f', chunk)[0]
                elif acc['componentType'] == 5125: arr[k,c] = struct.unpack('<I', chunk)[0]
                elif acc['componentType'] == 5123: arr[k,c] = struct.unpack('<H', chunk)[0]
                elif acc['componentType'] == 5121: arr[k,c] = struct.unpack('<B', chunk)[0]
        data = pack_accessor(arr, acc['componentType'], None)
    # append
    off = len(new_bin)
    while off % 4: new_bin.extend(b'\0'); off = len(new_bin)
    view_remap.setdefault(acc['bufferView'], []).append((ai, off, len(data)))
    acc['_newoff'] = off
    acc['_newlen'] = len(data)
    new_bin.extend(data)

# Rewrite bufferViews: merge all accessors that shared a view? No — each original
# bufferView may serve 1 accessor here (rig output is tightly packed per attr).
# To stay safe: point every accessor's bufferView to a FRESH view with its own range.
new_views = []
for ai, acc in enumerate(gltf['accessors']):
    vi = acc['bufferView']
    # create/reuse one view per original view: first accessor to touch it defines it
    pass
# simpler: build one view per accessor
views_by_acc = {}
for ai, acc in enumerate(gltf['accessors']):
    views_by_acc[ai] = len(new_views)
    new_views.append({'buffer': 0, 'byteOffset': acc['_newoff'], 'byteLength': acc['_newlen']})
    acc['bufferView'] = views_by_acc[ai]
    del acc['_newoff'], acc['_newlen']
gltf['bufferViews'] = new_views
gltf['buffers'][0]['byteLength'] = len(new_bin)

# cleanup: remove byteStride from views (all tight now); bufferView target preserved?
for v in gltf['bufferViews']:
    if 'byteStride' in v: del v['byteStride']

js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
pad = (4 - len(js) % 4) % 4
js += b' ' * pad
total = 12 + 8 + len(js) + 8 + len(new_bin)
with open(SRC, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A))
    f.write(js)
    f.write(struct.pack('<II', len(new_bin), 0x004E4942))
    f.write(bytes(new_bin))
print(f"\nwrote {SRC}: {total} bytes (was {len(open(BAK,'rb').read())})")

# ---------------- post-surgery audit ----------------
gltf2, buf2 = load(SRC)
for mi, mesh in enumerate(gltf2['meshes']):
    p = mesh['primitives'][0]
    pos = read_raw(gltf2, buf2, p['attributes']['POSITION'])
    print(f"{mesh.get('name')}: {len(pos)} verts")
    if mesh.get('name') == 'knight_lower':
        jts = read_raw(gltf2, buf2, p['attributes']['JOINTS_0']).astype(int)
        wts = read_raw(gltf2, buf2, p['attributes']['WEIGHTS_0'])
        wts = wts / np.maximum(wts.max(axis=1, keepdims=True), 1) * np.where(wts.max(axis=1, keepdims=True) > 0, 255, 0)
        jn = [gltf2['nodes'][j]['name'] for j in gltf2['skins'][0]['joints']]
        dom = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])
        from collections import Counter
        c = Counter(dom)
        for bn in ['j_ankleL','j_ankleR','j_kneeL','j_kneeR','j_hipL','j_hipR']:
            m = dom == bn
            if m.sum():
                pp = pos[m]
                print(f"  {bn}: {m.sum()} verts  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]")
        # foot check: verts below y 0.22
        foot = pos[(pos[:,1] < 0.22)]
        L = foot[foot[:,0] > -0.05]; R = foot[foot[:,0] <= -0.05]
        print(f"  foot-level verts: left-ish {len(L)} (X[{L[:,0].min():+.3f},{L[:,0].max():+.3f}] Z[{L[:,2].min():+.3f},{L[:,2].max():+.3f}])  right {len(R)} (X[{R[:,0].min():+.3f},{R[:,0].max():+.3f}] Z[{R[:,2].min():+.3f},{R[:,2].max():+.3f}])")
