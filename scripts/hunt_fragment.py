#!/usr/bin/env python3
"""F28 v4 — hunt the last floating fragment: list ALL small components of the
current knight_lower/upper with bboxes, flag those in 'air zones' (between the
shins, in front of the tabard, off the flanks) as junk candidates."""
import json, struct
import numpy as np

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
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

g, buf = load('/home/z/my-project/public/game/models/knight_rigged.glb')
jn = [g['nodes'][j]['name'] for j in g['skins'][0]['joints']]

for mi, want in [(1, 'knight_lower'), (0, 'knight_upper')]:
    p = g['meshes'][mi]['primitives'][0]
    pos = rr(g, buf, p['attributes']['POSITION'])
    jts = rr(g, buf, p['attributes']['JOINTS_0']).astype(int)
    wts = rr(g, buf, p['attributes']['WEIGHTS_0'])
    dom = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])
    idx = rr(g, buf, p['indices']).astype(np.int64).reshape(-1, 3)
    n = len(pos)
    # union-find over TRIANGLES (shared verts) -> vert components
    nt = len(idx)
    parent = np.arange(nt)
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for c in range(3):
        e = np.sort(np.stack([idx[:, c], idx[:, (c+1)%3]], axis=1), axis=1)
        o = np.lexsort((e[:,1], e[:,0])); es = e[o]
        ng = np.ones(len(es), dtype=bool); ng[1:] = (es[1:] != es[:-1]).any(axis=1)
        eid = np.cumsum(ng)-1
        edge_ids = np.empty(len(es), dtype=np.int64); edge_ids[o] = eid
        toe = np.repeat(np.arange(nt), 3)
        o2 = np.argsort(edge_ids, kind='stable')
        ei = edge_ids[o2]; tt = toe[o2]
        same = ei[1:] == ei[:-1]
        for k in np.nonzero(same)[0]:
            ra, rb = find(tt[k]), find(tt[k+1])
            if ra != rb: parent[ra] = rb
    roots = np.array([find(i) for i in range(nt)])
    from collections import Counter, defaultdict
    comp_tris = defaultdict(list)
    for t in range(nt): comp_tris[roots[t]].append(t)
    print(f"\n===== {want}: {len(comp_tris)} components =====")
    # body zones (where legit armor lives): attached around the leg columns etc.
    for r, tris in sorted(comp_tris.items(), key=lambda kv: -len(kv[1])):
        if len(tris) > 120: continue   # big masses = body
        v = np.unique(idx[tris])
        pp = pos[v]
        cx, cy, cz = pp.mean(axis=0)
        # air-zone test: between shins / in front of tabard / high medial
        air = False; why = ''
        if -0.10 < cx < 0.06 and 0.15 < cy < 0.55 and cz > 0.02: air=True; why='between-shins'
        elif -0.20 < cx < 0.20 and 0.30 < cy < 0.85 and cz > 0.16: air=True; why='front-of-tabard'
        elif cx > 0.20 and cy > 0.25 and cy < 1.05: air=True; why='left-flank'
        elif cx < -0.20 and cz > 0.17 and cy < 0.8: air=True; why='right-front'
        if air and len(tris) <= 120:
            print(f"  comp r={r}: {len(tris)} tris {len(v)} verts c=({cx:+.2f},{cy:+.2f},{cz:+.2f}) bbox X[{pp[:,0].min():+.2f},{pp[:,0].max():+.2f}] Y[{pp[:,1].min():+.2f},{pp[:,1].max():+.2f}] Z[{pp[:,2].min():+.2f},{pp[:,2].max():+.2f}] dom={Counter(dom[v]).most_common(2)} [{why}]")
