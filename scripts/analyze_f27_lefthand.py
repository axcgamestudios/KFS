#!/usr/bin/env python3
"""F27 — isolate the LEFT hand triangles of the current GLB:
which mesh, which joints, what bounds. Print stats to design the mirror."""
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
    st = bv.get('byteStride',0)
    out = np.empty((n, comp), dtype=np.float64)
    for k in range(n):
        po = off+k*st
        if comp == 3: out[k] = struct.unpack_from('<3f', buf, po)
        elif comp == 4:
            if acc['componentType'] == 5121: out[k] = struct.unpack_from('<4B', buf, po)
            else: out[k] = struct.unpack_from('<4f', buf, po)
        elif comp == 2: out[k] = struct.unpack_from('<2f', buf, po)
        elif comp == 1: out[k] = struct.unpack_from('<I' if acc['componentType']==5125 else '<f', buf, po)[0]
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
wL, wR = world('j_wristL'), world('j_wristR')
eL, eR = world('j_elbowL'), world('j_elbowR')
print('wristL', np.round(wL,3), 'elbowL', np.round(eL,3))
print('wristR', np.round(wR,3), 'elbowR', np.round(eR,3))
print('forearm dir L (elbow->wrist):', np.round((wL-eL)/np.linalg.norm(wL-eL),3))
print('forearm dir R (elbow->wrist):', np.round((wR-eR)/np.linalg.norm(wR-eR),3))

for m in g['meshes']:
    name = m.get('name','?')
    if name in ('knight_sword','knight_shield'): continue
    p = m['primitives'][0]
    P = rr(g, buf, p['attributes']['POSITION'])
    if 'JOINTS_0' not in p['attributes']:
        print(name, 'no skin'); continue
    J = rr(g, buf, p['attributes']['JOINTS_0']).astype(int)
    W = rr(g, buf, p['attributes']['WEIGHTS_0'])
    # distance to wristL
    d = np.linalg.norm(P - wL, axis=1)
    # hand candidate: within 0.45 of wristL, y below wristL+0.03
    near = (d < 0.45) & (P[:,1] < wL[1] + 0.03)
    # which joints dominate those verts?
    if near.sum() == 0: continue
    dom = J[near][np.arange(near.sum()), np.argmax(W[near], axis=1)]
    from collections import Counter
    print(f'== {name}: {near.sum()} verts near wristL-below')
    print('   dominant joints:', Counter([jn[x] for x in dom]).most_common(8))
    # tighter: within 0.45 AND dominated by elbowL or wristL
    domAll = J[np.arange(len(P)), np.argmax(W, axis=1)]
    handish = near & np.isin(domAll, [jidx['j_elbowL'], jidx['j_wristL']])
    print(f'   handish (elbowL/wristL dominated): {handish.sum()}')
    if handish.sum():
        HP = P[handish]
        print('   hand bbox min', np.round(HP.min(0),3), 'max', np.round(HP.max(0),3))
        # distance from wristL to farthest hand vert
        print('   max |hand - wristL| =', np.round(np.linalg.norm(HP-wL,axis=1).max(),3))
        # y distribution
        print('   y range', np.round(HP[:,1].min(),3), np.round(HP[:,1].max(),3))
        # triangles fully inside handish
        idx = rr(g, buf, p['indices']).astype(np.int64).reshape(-1,3)
        intri = handish[idx].all(axis=1)
        print(f'   triangles fully inside: {intri.sum()}')
        # joint weight profile of handish verts
        subJ = J[handish]; subW = W[handish]
        wsum = np.zeros(len(jn))
        for c in range(4):
            np.add.at(wsum, subJ[:,c], subW[:,c])
        top = np.argsort(wsum)[::-1][:5]
        print('   weight mass top5:', [(jn[t], round(wsum[t],1)) for t in top])
