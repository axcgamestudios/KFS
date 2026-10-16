#!/usr/bin/env python3
"""F28 — definitive component analysis of the source statue's Lower mesh.
Runs the SAME union-find as rig_knight.find_shield, lists ALL components with
bboxes, and identifies: the true shield (X[3..45], Z[10..30], tall), the feet,
and every component that the rig's leg-region classifier would sweep into the
left leg (x>-9) at ground level (y<-85)."""
import json, struct, sys
import numpy as np

sys.path.insert(0, '/home/z/my-project/scripts')

def load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data[bin_off+8:bin_off+8+bin_len]

def read_attr(gltf, buf, acc_idx):
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
        elif comp == 2: out[k] = struct.unpack_from('<2f', buf, po)
        elif comp == 1: out[k] = struct.unpack_from('<'+fmt, buf, po)[0]
    return out

gltf, buf = load_glb('/home/z/my-project/public/game/models/knight_statue.glb')
# Lower mesh = mesh 0 (35203 verts), Upper = mesh 1
lo_p = gltf['meshes'][0]['primitives'][0]
pos = read_attr(gltf, buf, lo_p['attributes']['POSITION'])
nrm = read_attr(gltf, buf, lo_p['attributes']['NORMAL'])
idx = read_attr(gltf, buf, lo_p['indices']).astype(np.int64).reshape(-1, 3)
n = len(idx)
print(f'Lower mesh: {len(pos)} verts, {n} tris')

# ---- union-find over shared vertices (same as find_shield)
parent = np.arange(n, dtype=np.int64)
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
for c in range(3):
    c2 = (c + 1) % 3
    e = np.stack([idx[:, c], idx[:, c2]], axis=1)
    e.sort(axis=1)
    o = np.lexsort((e[:, 1], e[:, 0]))
    es = e[o]
    ng = np.ones(len(es), dtype=bool)
    ng[1:] = (es[1:] != es[:-1]).any(axis=1)
    eid = np.cumsum(ng) - 1
    edge_ids = np.empty(len(es), dtype=np.int64)
    edge_ids[o] = eid
    tri_of_edge = np.repeat(np.arange(n), 3)
    o2 = np.argsort(edge_ids, kind='stable')
    ei = edge_ids[o2]; tt = tri_of_edge[o2]
    same = ei[1:] == ei[:-1]
    for k in np.nonzero(same)[0]:
        ra, rb = find(tt[k]), find(tt[k+1])
        if ra != rb: parent[ra] = rb

roots = np.array([find(i) for i in range(n)])
uniq, counts = np.unique(roots, return_counts=True)
print(f'\ncomponents: {len(uniq)}')
tris = pos[idx]
print(f"{'comp':>6} {'tris':>6}  {'bbox X':>21} {'Y':>21} {'Z':>21}  note")
for u, cnt in sorted(zip(uniq, counts), key=lambda t: -t[1])[:14]:
    mask = roots == u
    pts = tris[mask].reshape(-1, 3)
    note = ''
    if pts[:, 2].min() > 11 and pts[:, 1].min() < -85 and cnt > 500:
        note = '<<< rig find_shield CRITERIA MATCH'
    # foot-like: reaches ground, narrow
    if pts[:, 1].min() < -100 and cnt <= 600:
        note += ' [ground-touching]'
    print(f"{u:>6} {cnt:>6}  [{pts[:,0].min():+7.1f},{pts[:,0].max():+7.1f}] [{pts[:,1].min():+7.1f},{pts[:,1].max():+7.1f}] [{pts[:,2].min():+7.1f},{pts[:,2].max():+7.1f}]  {note}")

# ---- what does the rig's leg-region classifier do at ground level?
# leg regions: legR -40..-9, legL -9..+30 (statue x). Everything y<-88 = rigid sabaton clamp.
# The shield is at x 3..45, z 10..30 — the legL band x>-9 catches x 3..30 of the shield!
print("\n--- Simulating the rig classifier on the SOURCE Lower mesh ---")
GAME = 1.95 / 210.0
cen = tris.mean(axis=1)
ground_tris = cen[:, 1] < -85
for label, sel in [('x > -9 (legL band)', cen[:, 0] > -9),
                   ('x < -9 (legR band)', cen[:, 0] < -9)]:
    m = ground_tris & sel
    pts = tris[m].reshape(-1, 3)
    if len(pts):
        print(f"{label}: {int(m.sum())} tris  X[{pts[:,0].min():+.1f},{pts[:,0].max():+.1f}] Z[{pts[:,2].min():+.1f},{pts[:,2].max():+.1f}]")
# the shield component's ground part vs the left foot:
# find the biggest component (should be legs+skirt or shield)
for u, cnt in sorted(zip(uniq, counts), key=lambda t: -t[1])[:6]:
    mask = roots == u
    pts = tris[mask].reshape(-1, 3)
    g = pts[pts[:, 1] < -85]
    if len(g):
        print(f"comp {u} ({cnt} tris) ground part: {len(g)} verts  X[{g[:,0].min():+.1f},{g[:,0].max():+.1f}] Z[{g[:,2].min():+.1f},{g[:,2].max():+.1f}]")
