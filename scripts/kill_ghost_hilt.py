#!/usr/bin/env python3
"""F28 v7 — kill the GHOST HILT: upper verts near the sword axis above the
extraction box top (y>0.932, dist_to_axis<0.055). The fist's outer surface
(r>0.055) and the belt survive."""
import json, struct
import numpy as np
from collections import Counter

SRC = '/home/z/my-project/public/game/models/knight_rigged.glb'

def load(path):
    with open(path, 'rb') as f: data = f.read()
    jl, _ = struct.unpack_from('<II', data, 12)
    g = json.loads(data[20:20+jl].decode())
    bo = 20 + jl
    while bo % 4: bo += 1
    bl, _ = struct.unpack_from('<II', data, bo)
    return g, data[bo+8:bo+8+bl]

TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def rr(g, buf, ai):
    acc = g['accessors'][ai]; bv = g['bufferViews'][acc['bufferView']]
    comp = TYPES[acc['type']]
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[acc['componentType']]
    n, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    st = bv.get('byteStride',0) or struct.calcsize('<'+fmt)*comp
    out = np.empty((n, comp))
    for k in range(n):
        po = off+k*st
        if comp==3 and acc['componentType']==5126: out[k]=struct.unpack_from('<3f',buf,po)
        elif comp==1 and acc['componentType']==5125: out[k]=struct.unpack_from('<I',buf,po)[0]
        elif comp==4 and acc['componentType']==5126: out[k]=struct.unpack_from('<4f',buf,po)
        elif comp==4 and acc['componentType']==5121: out[k]=struct.unpack_from('<4B',buf,po)
        elif comp==2: out[k]=struct.unpack_from('<2f',buf,po)
        else: out[k]=struct.unpack_from('<'+fmt*comp,buf,po)
    return out

def pack(arr, ct):
    if ct == 5126: return np.asarray(arr, dtype='<f4').tobytes()
    if ct == 5125: return np.asarray(arr, dtype='<u4').tobytes()
    if ct == 5123: return np.asarray(arr, dtype='<u2').tobytes()
    if ct == 5121: return np.asarray(arr, dtype='<u1').tobytes()
    raise ValueError(ct)

g, buf = load(SRC)
jn = [g['nodes'][j]['name'] for j in g['skins'][0]['joints']]

# sword axis (from prop fit): x = 0.068*y - 0.2673, z = -0.0378*y + 0.2022
ax_x, bx_x = 0.0680, -0.2673
az_z, bz_z = -0.0378, 0.2022

mi = 0  # knight_upper
p = g['meshes'][mi]['primitives'][0]
pos = rr(g, buf, p['attributes']['POSITION'])
jts = rr(g, buf, p['attributes']['JOINTS_0']).astype(int)
wts = rr(g, buf, p['attributes']['WEIGHTS_0'])
idx = rr(g, buf, p['indices']).astype(np.int64).reshape(-1, 3)
dom = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])

cx = ax_x * pos[:,1] + bx_x
cz = az_z * pos[:,1] + bz_z
dist = np.sqrt((pos[:,0]-cx)**2 + (pos[:,2]-cz)**2)
kill = (pos[:,1] > 0.932) & (pos[:,1] < 1.10) & (dist < 0.055) & ((dom == 'j_wristR') | (dom == 'j_elbowR'))
print(f'ghost hilt kill: {kill.sum()} verts, bones: {dict(Counter(dom[kill]))}')
pp = pos[kill]
print(f'  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')

tri_kill = kill[idx].any(axis=1)
keep_tris = idx[~tri_kill]
used, remap = np.unique(keep_tris.reshape(-1), return_inverse=True)
new_idx = remap.reshape(-1, 3)
nrm = rr(g, buf, p['attributes']['NORMAL'])
uv = rr(g, buf, p['attributes']['TEXCOORD_0'])
print(f'knight_upper: -{int(tri_kill.sum())} tris -> {len(used)} verts')

ACC_OF = {
    p['attributes']['POSITION']: pos[used],
    p['attributes']['NORMAL']: nrm[used],
    p['attributes']['TEXCOORD_0']: uv[used],
    p['attributes']['JOINTS_0']: jts[used],
    p['attributes']['WEIGHTS_0']: wts[used],
    p['indices']: new_idx,
}

# rebuild
new_bin = bytearray(); new_views = []; img_view_map = {}
for img in g.get('images', []):
    vi = img['bufferView']
    if vi in img_view_map: continue
    bv = g['bufferViews'][vi]
    blob = bytes(buf[bv['byteOffset']:bv['byteOffset']+bv['byteLength']])
    off = len(new_bin)
    while off % 4: new_bin.extend(b'\0'); off = len(new_bin)
    img_view_map[vi] = len(new_views)
    new_views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(blob)})
    new_bin.extend(blob)
for img in g.get('images', []):
    img['bufferView'] = img_view_map[img['bufferView']]
for ai, acc in enumerate(g['accessors']):
    if ai in ACC_OF:
        arr = ACC_OF[ai]
        if 'max' in acc:
            a2 = np.asarray(arr)
            if TYPES[acc['type']] >= 2:
                acc['max'] = a2.max(axis=0).tolist(); acc['min'] = a2.min(axis=0).tolist()
            else:
                acc['max'] = [float(a2.max())]; acc['min'] = [float(a2.min())]
    else:
        arr = rr(g, buf, ai)
    acc['count'] = arr.size if acc['type'] == 'SCALAR' else len(arr)
    data = pack(arr, acc['componentType'])
    off = len(new_bin)
    while off % 4: new_bin.extend(b'\0'); off = len(new_bin)
    acc['bufferView'] = len(new_views)
    new_views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    new_bin.extend(data)
g['bufferViews'] = new_views
g['buffers'][0]['byteLength'] = len(new_bin)
js = json.dumps(g, separators=(',', ':')).encode('utf-8')
pad = (4 - len(js) % 4) % 4; js += b' ' * pad
total = 12 + 8 + len(js) + 8 + len(new_bin)
with open(SRC, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(new_bin), 0x004E4942)); f.write(bytes(new_bin))
print(f'wrote {SRC}: {total} bytes')
