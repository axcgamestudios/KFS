#!/usr/bin/env python3
"""F27 — extract the LEFT HAND triangles from the CURRENT GLB with correct
accessor reading; report joints/weights/bbox for the mirror surgery."""
import json, struct
import numpy as np
from collections import Counter

def load(path):
    with open(path, 'rb') as f: data = f.read()
    jl, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+jl].decode())
    bo = 20 + jl
    while bo % 4: bo += 1
    bl, _ = struct.unpack_from('<II', data, bo)
    return gltf, data[bo+8:bo+8+bl]

def readacc(g, buf, ai):
    acc = g['accessors'][ai]; bv = g['bufferViews'][acc['bufferView']]
    ct = acc['componentType']; typ = acc['type']
    comp = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[typ]
    n, off = acc['count'], bv.get('byteOffset',0)+acc.get('bufferOffset',0)
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[ct]
    out = np.empty((n, comp))
    for k in range(n):
        po = off+k*comp*struct.calcsize('<'+fmt)
        out[k] = struct.unpack_from('<'+fmt*comp, buf, po)
    return out

g, buf = load('/home/z/my-project/public/game/models/knight_rigged.glb')
jn = [g['nodes'][j]['name'] for j in g['skins'][0]['joints']]
jidx = {n: i for i, n in enumerate(jn)}
nodes = g['nodes']; par = {}
for i, n in enumerate(nodes):
    for ch in n.get('children', []): par[ch] = i
def world(name):
    j = g['skins'][0]['joints'][jidx[name]]
    chain=[]; i=j
    while i is not None: chain.append(i); i=par.get(i)
    p=np.zeros(3)
    for c in chain[::-1]: p+=np.array(nodes[c].get('translation',[0,0,0]),float)
    return p
wL = world('j_wristL')

for m in g['meshes']:
    name = m.get('name','?')
    if name in ('knight_sword','knight_shield'): continue
    p = m['primitives'][0]
    P = readacc(g, buf, p['attributes']['POSITION'])
    J = readacc(g, buf, p['attributes']['JOINTS_0']).astype(int)
    W = readacc(g, buf, p['attributes']['WEIGHTS_0'])
    d = np.linalg.norm(P - wL, axis=1)
    near = d < 0.42
    below = P[:,1] < wL[1] + 0.04
    dom = J[np.arange(len(P)), np.argmax(W, axis=1)]
    handish = near & below & np.isin(dom, [jidx['j_elbowL'], jidx['j_wristL']])
    if handish.sum() == 0:
        print(f'{name}: no handish verts')
        continue
    HP = P[handish]
    print(f'== {name}: handish {handish.sum()} verts')
    print('   bbox min', np.round(HP.min(0),3), 'max', np.round(HP.max(0),3))
    print('   max dist from wristL:', round(np.linalg.norm(HP-wL,axis=1).max(),3))
    # joints used by handish verts (all 4 slots)
    subJ = J[handish]; subW = W[handish]
    used = Counter()
    for c in range(4):
        sel = subW[:,c] > 1e-6
        for jv in np.unique(subJ[sel,c]): used[jn[jv]] += int(sel.sum() if False else 0)
    # weight mass per joint
    wsum = {}
    for c in range(4):
        sel = subW[:,c] > 1e-6
        for k in np.where(sel)[0]:
            wsum[jn[subJ[k,c]]] = wsum.get(jn[subJ[k,c]],0) + subW[k,c]
    print('   weight mass:', sorted(wsum.items(), key=lambda kv:-kv[1]))
    # triangle completeness
    idx = readacc(g, buf, p['indices']).astype(np.int64).reshape(-1,3)
    intri = handish[idx].all(axis=1)
    partial = (handish[idx].any(axis=1) & ~intri).sum()
    print(f'   triangles fully inside: {intri.sum()}, partial: {partial}')
    # how far do partial triangles reach (should be the wrist cuff blending into forearm)
    if partial:
        ptris = idx[handish[idx].any(axis=1) & ~intri]
        pv = np.unique(ptris)
        pd = d[pv]
        print('   partial verts dist range:', round(pd.min(),3), round(pd.max(),3))
