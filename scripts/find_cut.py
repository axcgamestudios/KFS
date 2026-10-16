#!/usr/bin/env python3
"""F28 — find the exact cut plane between the LEFT FOOT and the shield remnant
in knight_rigged.glb's knight_lower mesh. Dumps z-distribution by y band for
verts in the front-left region (x > -0.02), plus normals analysis."""
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
        elif comp == 1: out[k] = struct.unpack_from('<'+fmt, buf, po)[0]
    return out

gltf, buf = load('/home/z/my-project/public/game/models/knight_rigged.glb')
p = gltf['meshes'][1]['primitives'][0]  # knight_lower
pos = read_acc(gltf, buf, p['attributes']['POSITION'])
nrm = read_acc(gltf, buf, p['attributes']['NORMAL'])
joints = read_acc(gltf, buf, p['attributes']['JOINTS_0']).astype(int)
weights = read_acc(gltf, buf, p['attributes']['WEIGHTS_0'], norm=True)
jnames = [gltf['nodes'][j]['name'] for j in gltf['skins'][0]['joints']]
dom = np.array([jnames[joints[i, np.argmax(weights[i])]] for i in range(len(pos))])

# front-left region: x > -0.02 (medial-left), all y — the shield column zone
reg = (pos[:, 0] > -0.02) & (pos[:, 0] < 0.34)
print("=== z-histogram by y-band, front-left region (x in [-0.02,0.34]) ===")
for y0, y1 in [(0.0,0.08),(0.08,0.16),(0.16,0.25),(0.25,0.40),(0.40,0.60),(0.60,0.85),(0.85,1.10)]:
    m = reg & (pos[:,1] >= y0) & (pos[:,1] < y1)
    if not m.sum(): continue
    z = pos[m,2]
    h, e = np.histogram(z, bins=np.arange(-0.16, 0.30, 0.02))
    dist = ' '.join(f"{e[i]:+.2f}:{int(h[i])}" for i in range(len(h)) if h[i] > 0)
    print(f"y[{y0:.2f},{y1:.2f}) n={m.sum():4d}  {dist}")

print("\n=== per-band: what dominant bones live at z>0.105 (the kill zone) ===")
kz = reg & (pos[:,2] > 0.105)
from collections import Counter
for y0, y1 in [(0.0,0.20),(0.20,0.45),(0.45,0.75),(0.75,1.10)]:
    m = kz & (pos[:,1] >= y0) & (pos[:,1] < y1)
    c = Counter(dom[m])
    print(f"y[{y0:.2f},{y1:.2f}) n={m.sum():4d}: {dict(c)}")

print("\n=== LEFT FOOT (z <= 0.105, x>0.14, y<0.20) shape ===")
footL = (pos[:,0] > 0.14) & (pos[:,2] <= 0.105) & (pos[:,1] < 0.20)
print(f"n={footL.sum()}  X[{pos[footL,0].min():+.3f},{pos[footL,0].max():+.3f}] Y[{pos[footL,1].min():+.3f},{pos[footL,1].max():+.3f}] Z[{pos[footL,2].min():+.3f},{pos[footL,2].max():+.3f}]")
print(f"dom bones: {dict(Counter(dom[footL]))}")

print("\n=== REMNANT candidate (z > 0.105, x>-0.02, y<1.10) shape ===")
rem = kz & (pos[:,1] < 1.10)
print(f"n={rem.sum()}  X[{pos[rem,0].min():+.3f},{pos[rem,0].max():+.3f}] Y[{pos[rem,1].min():+.3f},{pos[rem,1].max():+.3f}] Z[{pos[rem,2].min():+.3f},{pos[rem,2].max():+.3f}]")
# normals of the remnant: vertical plate → normals horizontal (small ny)
ny = nrm[rem,1]; nz = nrm[rem,2]
print(f"remnant normals: |ny|<0.4 (horizontal-facing): {(np.abs(ny)<0.4).sum()}/{rem.sum()} = {100*(np.abs(ny)<0.4).mean():.0f}%")
# what about foot toe verts at z>0.105?
toe = footL & (pos[:,2] > 0.105)
print(f"\nleft-foot verts with z>0.105: {toe.sum()}")
if toe.sum():
    print(f"  their z: {np.round(np.sort(pos[toe,2]),3)}")
    print(f"  their y: [{pos[toe,1].min():.3f},{pos[toe,1].max():.3f}]")
    print(f"  their dom bones: {dict(Counter(dom[toe]))}")
# check z-gap: verts in z 0.09..0.13
gap = reg & (pos[:,2] > 0.09) & (pos[:,2] < 0.13) & (pos[:,1] < 0.2)
print(f"\nverts in z-gap [0.09,0.13] y<0.2: {gap.sum()}  z values: {np.round(np.sort(pos[gap,2]),3)[:30]}")
