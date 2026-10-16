#!/usr/bin/env python3
"""F28 — measure the medial strip (x in [-0.16,-0.02]) at z>0.142 in
knight_lower, by y band, to define the safe medial-extension kill."""
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
p = gltf['meshes'][1]['primitives'][0]
pos = read_acc(gltf, buf, p['attributes']['POSITION'])
jts = read_acc(gltf, buf, p['attributes']['JOINTS_0']).astype(int)
wts = read_acc(gltf, buf, p['attributes']['WEIGHTS_0'], norm=True)
jnames = [gltf['nodes'][j]['name'] for j in gltf['skins'][0]['joints']]
dom = np.array([jnames[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])

strip = (pos[:,0] >= -0.16) & (pos[:,0] < -0.02)
print("=== medial strip x[-0.16,-0.02): ALL verts z-histogram by y-band ===")
for y0, y1 in [(0.0,0.2),(0.2,0.45),(0.45,0.60),(0.60,0.75),(0.75,0.85),(0.85,1.10)]:
    m = strip & (pos[:,1] >= y0) & (pos[:,1] < y1)
    if not m.sum(): continue
    z = pos[m,2]
    hi = z > 0.142
    from collections import Counter
    c = Counter(dom[m & (pos[:,2] > 0.142)])
    print(f"y[{y0:.2f},{y1:.2f}) n={m.sum():4d}  z>0.142: {hi.sum():4d}  dom bones of those: {dict(c)}")
    if hi.sum():
        zz = z[hi]
        print(f"    their z: [{zz.min():.3f},{zz.max():.3f}]")

print("\n=== same strip on the UPPER mesh for reference (does torso cross z 0.142 there?) ===")
pu = gltf['meshes'][0]['primitives'][0]
upos = read_acc(gltf, buf, pu['attributes']['POSITION'])
us = (upos[:,0] >= -0.16) & (upos[:,0] < -0.02) & (upos[:,2] > 0.142)
print(f"upper verts in strip z>0.142: {us.sum()}  y range: [{upos[us,1].min():.3f},{upos[us,1].max():.3f}]" if us.sum() else "none")
