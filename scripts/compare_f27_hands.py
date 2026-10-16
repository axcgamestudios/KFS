#!/usr/bin/env python3
"""F27 — compare right/left hand vertex populations between the F26 backup
GLB and the current (post-F28-surgery) GLB."""
import json, struct
import numpy as np

def load(path):
    with open(path, 'rb') as f: data = f.read()
    jl, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+jl].decode())
    bo = 20 + jl
    while bo % 4: bo += 1
    bl, _ = struct.unpack_from('<II', data, bo)
    return gltf, data[bo+8:bo+8+bl]

TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def rr(g, buf, ai):
    acc = g['accessors'][ai]; bv = g['bufferViews'][acc['bufferView']]
    comp = TYPES[acc['type']]
    n, off = acc['count'], bv.get('byteOffset',0)+acc.get('bufferOffset',0)
    off = bv.get('byteOffset',0)+acc.get('bufferOffset',0)
    st = bv.get('byteStride',0)
    out = np.empty((n, comp))
    for k in range(n):
        po = off+k*st
        if comp==3: out[k]=struct.unpack_from('<3f',buf,po)
        elif comp==4 and acc['componentType']==5126: out[k]=struct.unpack_from('<4f',buf,po)
        elif comp==4 and acc['componentType']==5121: out[k]=struct.unpack_from('<4B',buf,po)
        elif comp==2: out[k]=struct.unpack_from('<2f',buf,po)
        else: out[k]=struct.unpack_from('<f',buf,po)
    return out

for path in ['/home/z/my-project/scripts/knight_rigged.glb.bak',
             '/home/z/my-project/public/game/models/knight_rigged.glb']:
    g, buf = load(path)
    print('==', path.split('/')[-1])
    skin = g['skins'][0]
    jn = [g['nodes'][j]['name'] for j in skin['joints']]
    jidx = {n: i for i, n in enumerate(jn)}
    for m in g['meshes']:
        name = m.get('name','?')
        p = m['primitives'][0]
        pos = rr(g, buf, p['attributes']['POSITION'])
        if 'JOINTS_0' not in p['attributes']:
            print(f'  {name}: {len(pos)} verts (no skin)')
            continue
        jts = rr(g, buf, p['attributes']['JOINTS_0']).astype(int)
        wts = rr(g, buf, p['attributes']['WEIGHTS_0'])
        dom = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])
        # hands: near wrist joints, y in [0.9, 1.25], beyond |x| 0.28
        for side in ['L','R']:
            wrist = jidx.get(f'j_wrist{side}')
            if wrist is None: continue
            near = (dom == f'j_wrist{side}')
            hand_zone = near & (pos[:,1] > 0.88) & (pos[:,1] < 1.30) & (np.abs(pos[:,0]) > 0.24)
            total_wrist = (dom == f'j_wrist{side}').sum()
            print(f'  {name}: {len(pos)} verts | j_wrist{side} total={total_wrist} hand-zone={hand_zone.sum()}')
        # any verts below y<0.25 on wrist joints (the killed "sword tip fragment")
        for side in ['L','R']:
            frag = (dom == f'j_wrist{side}') & (pos[:,1] < 0.25)
            if frag.sum(): print(f'    -> j_wrist{side} LOW verts (y<0.25): {frag.sum()}')
