#!/usr/bin/env python3
"""F28 audit v3 — foot rigidity residuals, boundary loops, upper-mesh strays."""
import json, struct
import numpy as np

PATH = '/home/z/my-project/public/game/models/knight_rigged.glb'

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

gltf, buf = load(PATH)
nodes = gltf['nodes']
skin = gltf['skins'][0]
joint_idx = skin['joints']
jnames = [nodes[j]['name'] for j in joint_idx]
IBM = read_raw(gltf, buf, skin['inverseBindMatrices']).reshape(-1,4,4)

class M: pass
parts = {}
for m in gltf['meshes']:
    p = m['primitives'][0]
    mm = M(); mm.name = m.get('name')
    mm.pos = read_raw(gltf, buf, p['attributes']['POSITION'])
    mm.idx = read_raw(gltf, buf, p['indices']).astype(np.int64).reshape(-1,3)
    if 'JOINTS_0' in p['attributes']:
        mm.jts = read_raw(gltf, buf, p['attributes']['JOINTS_0']).astype(int)
        mm.wts = read_raw(gltf, buf, p['attributes']['WEIGHTS_0'])
    else:
        mm.jts = None
    parts[mm.name] = mm

def local_matrix(n):
    T = np.array(n.get('translation', [0,0,0]), dtype=float)
    q = np.array(n.get('rotation', [0,0,0,1]), dtype=float)
    x,y,z,w = q
    R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                  [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                  [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    M = np.eye(4); M[:3,:3] = R; M[:3,3] = T
    return M

parent = {}
for i, n in enumerate(nodes):
    for c in n.get('children', []):
        parent[c] = i

def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    M = np.eye(4); M[1,1]=c; M[1,2]=-s; M[2,1]=s; M[2,2]=c
    return M
def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    M = np.eye(4); M[0,0]=c; M[0,2]=s; M[1,1]=1; M[2,0]=-s; M[2,2]=c
    return M

node_of = {jnames[k]: joint_idx[k] for k in range(len(joint_idx))}
extra = {}
extra[node_of['j_hipL']]  = rot_x(+0.55)
extra[node_of['j_kneeL']] = rot_x(+0.35)
extra[node_of['j_hipR']]  = rot_x(-0.50)
extra[node_of['j_kneeR']] = rot_x(+0.25)
extra[node_of['j_torso']] = rot_y(0.10)
extra[node_of['j_shoulderL']] = rot_x(-0.3)
extra[node_of['j_shoulderR']] = rot_x(0.25)

def node_global(idx, use_extra=True):
    chain = []
    i = idx
    while i is not None:
        chain.append(i); i = parent.get(i)
    G = np.eye(4)
    for c in chain[::-1]:
        M = local_matrix(nodes[c])
        if use_extra and c in extra: M = extra[c] @ M
        G = G @ M
    return G

bindG = [node_global(ji, False) for ji in joint_idx]
posedG = [node_global(ji, True) for ji in joint_idx]

lower = parts['knight_lower']
upper = parts['knight_upper']

def skin(m, G):
    if m.jts is None:
        return m.pos.copy()
    P = np.concatenate([m.pos, np.ones((len(m.pos),1))], axis=1)
    out = np.zeros((len(m.pos), 4))
    SM = np.array([G[k] @ IBM[k] for k in range(len(joint_idx))])
    for c in range(4):
        jcol = m.jts[:, c]; wcol = m.wts[:, c]
        sel = wcol > 1e-6
        if not sel.any(): continue
        Ms = SM[jcol[sel]]
        out[sel] += np.einsum('nij,nj->ni', Ms, P[sel]) * wcol[sel, None]
    return out[:, :3]

wl = skin(lower, posedG)

# ---------------- A) foot rigidity residuals ----------------
selFoot = lower.pos[:,1] < 0.22

def kabsch(P, Q):
    """best rigid R,t: Q ~= (R@P.T).T + t"""
    cp, cq = P.mean(0), Q.mean(0)
    H = (P - cp).T @ (Q - cq)
    U, S, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    R = Vt.T @ np.diag([1,1,d]) @ U.T
    t = cq - R @ cp
    return R, t

print('== foot rigidity (walk pose, best-fit rigid transform residuals) ==')
for lbl, m in [('LEFT', selFoot & (lower.pos[:,0] > -0.05)), ('RIGHT', selFoot & (lower.pos[:,0] <= -0.05))]:
    P = lower.pos[m]; Q = wl[m]
    R, t = kabsch(P, Q)
    res = np.linalg.norm((R @ P.T).T + t - Q, axis=1)
    print(f'{lbl}: n={len(P)}  median={np.median(res)*1000:.1f}mm  p90={np.percentile(res,90)*1000:.1f}mm  max={res.max()*100:.1f}cm')
    print(f'     residual<5mm: {(res<0.005).mean()*100:.1f}%  <2cm: {(res<0.02).mean()*100:.1f}%  >5cm: {(res>0.05).sum()} verts')
    bad = res > 0.05
    if bad.any():
        bp = P[bad]; bq = Q[bad]
        print(f'     worst offenders bind Y[{bp[:,1].min():.3f},{bp[:,1].max():.3f}] Z[{bp[:,2].min():.3f},{bp[:,2].max():.3f}]')
        print(f'     worst offenders posed Y[{bq[:,1].min():.3f},{bq[:,1].max():.3f}] X[{bq[:,0].min():.3f},{bq[:,0].max():.3f}] Z[{bq[:,2].min():.3f},{bq[:,2].max():.3f}]')
    # dominant joints of the bad verts
    if bad.any():
        from collections import Counter
        idxs = np.where(m)[0][bad]
        dj = Counter(jnames[lower.jts[i, np.argmax(lower.wts[i])]] for i in idxs).most_common(5)
        print(f'     bad-vert dominant joints: {[(j,int(c)) for j,c in dj]}')

# ---------------- B) boundary loops of feet ----------------
print('\n== boundary loops (holes vs openings) ==')
edges = {}
for t in lower.idx:
    for a, b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0])):
        key = (min(a,b), max(a,b))
        edges[key] = edges.get(key, 0) + 1
boundary = [k for k, v in edges.items() if v == 1]
# build vert->boundary-edge adjacency and find loops
badj = {}
for a, b in boundary:
    badj.setdefault(a, []).append(b)
    badj.setdefault(b, []).append(a)
seen = set()
loops = []
for v in badj:
    if v in seen: continue
    comp = set(); stack = [v]
    while stack:
        u = stack.pop()
        if u in comp: continue
        comp.add(u); stack.extend(badj[u])
    seen |= comp
    pp = lower.pos[list(comp)]
    loops.append((len(comp), pp))
loops.sort(reverse=True, key=lambda x: x[0])
print(f'total boundary verts: {len(badj)}, loops: {len(loops)}')
for n, pp in loops[:12]:
    region = 'FOOT-area' if pp[:,1].max() < 0.35 else ('shin' if pp[:,1].max() < 0.8 else 'hip+')
    print(f'  loop {n:4d}v  Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]  {region}')
footloops = [(n,pp) for n,pp in loops if pp[:,1].max() < 0.30]
print(f'foot-level loops: {len(footloops)}')

# ---------------- C) upper mesh static strays ----------------
def components(mesh):
    n = len(mesh.pos)
    par = np.arange(n)
    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]
            a = par[a]
        return a
    for tri in mesh.idx:
        a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
        par[find(b)] = find(a); par[find(c)] = find(a)
    return np.array([find(i) for i in range(n)])

print('\n== knight_upper static (j_root) non-main components ==')
roots = components(upper)
dom = np.array([jnames[upper.jts[i, np.argmax(upper.wts[i])]] for i in range(len(upper.pos))])
sizes = sorted([((roots==r).sum(), r) for r in np.unique(roots)], reverse=True)
print(f'components: {len(sizes)}, main = {sizes[0][0]}v')
for nv, r in sizes[1:]:
    msk = roots == r
    pp = upper.pos[msk]
    root_share = (dom[msk] == 'j_root').mean()
    if root_share > 0.7:
        print(f'  static comp root={r}: {nv}v rootshare={root_share:.2f} X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')
print('\n== knight_lower static (j_root) non-main components (all) ==')
rootsl = components(lower)
doml = np.array([jnames[lower.jts[i, np.argmax(lower.wts[i])]] for i in range(len(lower.pos))])
sizesl = sorted([((rootsl==r).sum(), r) for r in np.unique(rootsl)], reverse=True)
tot = 0
for nv, r in sizesl[1:]:
    msk = rootsl == r
    pp = lower.pos[msk]
    root_share = (doml[msk] == 'j_root').mean()
    if root_share > 0.7:
        tot += nv
        print(f'  static comp root={r}: {nv}v X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')
print(f'  total static non-main lower verts: {tot}')
