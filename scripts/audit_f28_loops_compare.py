#!/usr/bin/env python3
"""Compare foot-region boundary loops: ORIGINAL (bak) vs CURRENT (post-v2 surgery).
Also render upper-mesh static strays highlighted for VLM identification."""
import json, struct
import numpy as np
from PIL import Image

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data[bin_off+8:bin_off+8+bin_len]

TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
FMT = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}

def read_raw(gltf, buf, acc_idx):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    comp = TYPES[acc['type']]
    fmt = FMT[acc['componentType']]
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
            else: out[k] = struct.unpack_from('<'+fmt, buf, po)[0]
        elif comp == 16: out[k] = struct.unpack_from('<16f', buf, po)
        else: out[k] = struct.unpack_from('<' + fmt*comp, buf, po)
    return out

def foot_boundary_loops(path, label):
    gltf, buf = load(path)
    lower = None
    for m in gltf['meshes']:
        if m.get('name') == 'knight_lower':
            p = m['primitives'][0]
            pos = read_raw(gltf, buf, p['attributes']['POSITION'])
            idx = read_raw(gltf, buf, p['indices']).astype(np.int64).reshape(-1,3)
    edges = {}
    for t in idx:
        for a, b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0])):
            key = (min(a,b), max(a,b))
            edges[key] = edges.get(key, 0) + 1
    boundary = [k for k, v in edges.items() if v == 1]
    badj = {}
    for a, b in boundary:
        badj.setdefault(a, []).append(b)
        badj.setdefault(b, []).append(a)
    seen = set(); loops = []
    for v in badj:
        if v in seen: continue
        comp = set(); stack = [v]
        while stack:
            u = stack.pop()
            if u in comp: continue
            comp.add(u); stack.extend(badj[u])
        seen |= comp
        pp = pos[list(comp)]
        loops.append((len(comp), pp))
    foot_loops = [(n,pp) for n,pp in loops if pp[:,1].max() < 0.30 and pp[:,1].min() < 0.25]
    print(f'{label}: total boundary edges {len(boundary)}, foot-level loops: {len(foot_loops)}')
    for n, pp in sorted(foot_loops, reverse=True, key=lambda x: x[0]):
        side = 'LEFT' if pp[:,0].mean() > -0.05 else 'RIGHT'
        print(f'   loop {n:4d}v ({side}) Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')
    return loops

foot_boundary_loops('/home/z/my-project/scripts/knight_rigged.glb.bak', 'ORIGINAL (bak, shield bug present)')
foot_boundary_loops('/home/z/my-project/public/game/models/knight_rigged.glb', 'CURRENT (post-v2 surgery)')
