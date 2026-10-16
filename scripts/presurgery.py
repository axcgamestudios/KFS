#!/usr/bin/env python3
"""F28 — pre-surgery checks: (1) sword shard verts in knight_lower right side,
(2) mixed-triangle counts for the kill set, (3) build the final plan."""
import json, struct
import numpy as np

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data[bin_off+8:bin_off+8+bin_len]

def read_acc(gltf, buf, acc_idx, norm=False):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    comp = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[acc['type']]
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[acc['componentType']]
    count, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    stride = bv.get('byteStride', 0) or struct.calcsize('<'+fmt)*comp
    out = np.empty((count, comp))
    for k in range(count):
        po = off + k*stride
        if comp == 3: out[k] = struct.unpack_from('<3f', buf, po)
        elif comp == 4:
            if acc['componentType'] == 5121:
                raw = np.array(struct.unpack_from('<4B', buf, po), dtype=np.float32)
                out[k] = raw/255.0 if norm else raw
            else: out[k] = struct.unpack_from('<4f', buf, po)
        elif comp == 2: out[k] = struct.unpack_from('<2f', buf, po)
        elif comp == 1: out[k] = struct.unpack_from('<'+fmt, buf, po)[0]
    return out

gltf, buf = load('/home/z/my-project/public/game/models/knight_rigged.glb')
p = gltf['meshes'][1]['primitives'][0]
pos = read_acc(gltf, buf, p['attributes']['POSITION'])
idx = read_acc(gltf, buf, p['indices']).astype(np.int64).reshape(-1, 3)
n = len(pos)
print(f'knight_lower: {n} verts, {len(idx)} tris')

d = np.load('/home/z/my-project/scripts/shots_f28/f28_kill_classes.npz', allow_pickle=True)
kc = d['kill_class']
kill = np.zeros(n, dtype=bool)
kill[d['kill_mask']] = (kc == 'shield_remnant') | (kc == 'hand_or_grip?')
# shield_base_junk lives in the foot cloud (z<=0.104 zone)
fc = d['foot_class']
kill[d['foot_mask']] = kill[d['foot_mask']] | (fc == 'shield_base_junk')
print(f'kill set: {kill.sum()} verts (shield_remnant + grip + base junk)')

# ---- sword shards on the right side of knight_lower
sword_zone = (pos[:,0] < -0.10) & (pos[:,0] > -0.36) & (pos[:,2] > 0.145) & (pos[:,1] > 0.20) & (pos[:,1] < 1.10)
print(f'\nright-side sword-zone verts (x<-0.10, z>0.145, 0.2<y<1.1): {sword_zone.sum()}')
if sword_zone.sum():
    sz = pos[sword_zone]
    print(f'  X[{sz[:,0].min():+.3f},{sz[:,0].max():+.3f}] Y[{sz[:,1].min():+.3f},{sz[:,1].max():+.3f}] Z[{sz[:,2].min():+.3f},{sz[:,2].max():+.3f}]')
    # z histogram
    h, e = np.histogram(sz[:,2], bins=np.arange(0.14, 0.32, 0.02))
    print('  z hist:', ' '.join(f'{e[i]:.2f}:{int(h[i])}' for i in range(len(h)) if h[i]>0))
    # how many at y>0.75 (pelvis zone, risky) vs below
    hi = sword_zone & (pos[:,1] > 0.75)
    print(f'  of which y>0.75 (pelvis/skirt zone — RISKY): {hi.sum()}')
    if hi.sum():
        hp = pos[hi]
        h2, e2 = np.histogram(hp[:,0], bins=np.arange(-0.36, 0.0, 0.03))
        print('    x hist of risky:', ' '.join(f'{e2[i]:+.2f}:{int(h2[i])}' for i in range(len(h2)) if h2[i]>0))

# ---- mixed triangles
tri_kill = kill[idx]
counts = tri_kill.sum(axis=1)
print(f'\ntriangle kill-vert counts: 0:{(counts==0).sum()} 1:{(counts==1).sum()} 2:{(counts==2).sum()} 3:{(counts==3).sum()}')
# mixed tris (1-2 kill verts): where are they?
mixed = (counts >= 1) & (counts <= 2)
if mixed.sum():
    mp = pos[idx[mixed]].reshape(-1, 3)
    print(f'mixed tris: {mixed.sum()}  their verts X[{mp[:,0].min():+.3f},{mp[:,0].max():+.3f}] Y[{mp[:,1].min():+.3f},{mp[:,1].max():+.3f}] Z[{mp[:,2].min():+.3f},{mp[:,2].max():+.3f}]')
    # list them
    for t in np.nonzero(mixed)[0][:20]:
        v = idx[t]
        print(f'  tri {t}: verts {v} kill={kill[v]} pos={np.round(pos[v],3).tolist()}')
