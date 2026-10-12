#!/usr/bin/env python3
"""Check UV validity of kit meshes (are UVs non-degenerate?)."""
import json, struct, sys
import numpy as np

def glb_chunks(path):
    data = open(path, 'rb').read()
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

js, bin_data = glb_chunks(sys.argv[1])
accessors = js['accessors']
bufferViews = js['bufferViews']

def read_acc(idx):
    acc = accessors[idx]
    bv = bufferViews[acc['bufferView']]
    start = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    comp = {'VEC2': 2, 'VEC3': 3, 'SCALAR': 1}[acc['type']]
    n = acc['count']
    dt = np.dtype(np.uint32 if acc['componentType'] == 5125 else np.float32)
    arr = np.frombuffer(bin_data, dtype=dt, count=n*comp, offset=start).reshape(n, comp)
    return arr

for mi, mesh in enumerate(js['meshes'][:14]):
    name = mesh.get('name', f'mesh{mi}')
    p = mesh['primitives'][0]
    attrs = p.get('attributes', {})
    if 'TEXCOORD_0' not in attrs:
        print(f'{name}: NO UV')
        continue
    uv = read_acc(attrs['TEXCOORD_0']).astype(np.float64)
    rng = uv.max(axis=0) - uv.min(axis=0)
    print(f'{name}: uv range x[{uv[:,0].min():.2f},{uv[:,0].max():.2f}] y[{uv[:,1].min():.2f},{uv[:,1].max():.2f}] spread=({rng[0]:.3f},{rng[1]:.3f}) unique={len(np.unique(uv,axis=0))}/{len(uv)}')
