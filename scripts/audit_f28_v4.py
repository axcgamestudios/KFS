#!/usr/bin/env python3
"""F28 audit v4 — joint bind positions, robust foot rigidity, foot boundary loops, upper-mesh stray detail."""
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

def node_global(idx):
    chain = []
    i = idx
    while i is not None:
        chain.append(i); i = parent.get(i)
    G = np.eye(4)
    for c in chain[::-1]:
        G = G @ local_matrix(nodes[c])
    return G

# ---- 1) joint bind positions ----
print('== joint bind global positions (legs/arms) ==')
for jn in ['j_hipL','j_kneeL','j_ankleL','j_hipR','j_kneeR','j_ankleR','j_wristL','j_wristR','j_root','j_torso']:
    if jn in jnames:
        G = node_global(node_of := joint_idx[jnames.index(jn)])
        print(f'  {jn}: [{G[0,3]:+.3f}, {G[1,3]:+.3f}, {G[2,3]:+.3f}]')

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

def node_global_posed(idx):
    chain = []
    i = idx
    while i is not None:
        chain.append(i); i = parent.get(i)
    G = np.eye(4)
    for c in chain[::-1]:
        M = local_matrix(nodes[c])
        if c in extra: M = extra[c] @ M
        G = G @ M
    return G

bindG = [node_global(ji) for ji in joint_idx]
posedG = [node_global_posed(ji) for ji in joint_idx]

lower = parts['knight_lower']

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
selFoot = lower.pos[:,1] < 0.22

# ---- 2) robust (trimmed) foot rigidity ----
def kabsch(P, Q):
    cp, cq = P.mean(0), Q.mean(0)
    H = (P - cp).T @ (Q - cq)
    U, S, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    R = Vt.T @ np.diag([1,1,d]) @ U.T
    t = cq - R @ cp
    return R, t

print('\n== robust foot rigidity (iterative trim 15%) ==')
for lbl, m in [('LEFT', selFoot & (lower.pos[:,0] > -0.05)), ('RIGHT', selFoot & (lower.pos[:,0] <= -0.05))]:
    P0 = lower.pos[m]; Q0 = wl[m]
    keep = np.ones(len(P0), dtype=bool)
    for _ in range(4):
        R, t = kabsch(P0[keep], Q0[keep])
        res = np.linalg.norm((R @ P0.T).T + t - Q0, axis=1)
        thr = np.percentile(res, 85)
        keep = res <= max(thr, 0.004)
    R, t = kabsch(P0[keep], Q0[keep])
    res = np.linalg.norm((R @ P0.T).T + t - Q0, axis=1)
    n = len(P0)
    print(f'{lbl}: n={n} inliers={keep.sum()} ({keep.mean()*100:.0f}%)  inlier-median={np.median(res[keep])*1000:.1f}mm  inlier-p95={np.percentile(res[keep],95)*1000:.1f}mm')
    print(f'     all: <5mm {(res<0.005).mean()*100:.0f}%  <2cm {(res<0.02).mean()*100:.0f}%  >5cm {(res>0.05).sum()}  >20cm {(res>0.20).sum()}')
    # inlier footprint after rigid motion (boot length preserved?)
    dims0 = P0[keep].max(0)-P0[keep].min(0); dims1 = Q0[keep].max(0)-Q0[keep].min(0)
    print(f'     inlier dims bind ({dims0[0]*100:.0f}x{dims0[1]*100:.0f}x{dims0[2]*100:.0f})cm -> posed ({dims1[0]*100:.0f}x{dims1[1]*100:.0f}x{dims1[2]*100:.0f})cm')
    # outliers
    out = res > 0.05
    if out.any():
        from collections import Counter
        idxs = np.where(m)[0][out]
        dj = Counter(jnames[lower.jts[i, np.argmax(lower.wts[i])]] for i in idxs).most_common(6)
        bp = P0[out]
        print(f'     outliers {out.sum()}v: bind X[{bp[:,0].min():+.3f},{bp[:,0].max():+.3f}] Y[{bp[:,1].min():+.3f},{bp[:,1].max():+.3f}] Z[{bp[:,2].min():+.3f},{bp[:,2].max():+.3f}] joints={[(j,int(c)) for j,c in dj]}')

# ---- 3) foot boundary loops detail ----
print('\n== foot-level boundary loops (Ymax<0.30) ==')
edges = {}
for t in lower.idx:
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
    pp = lower.pos[list(comp)]
    loops.append((len(comp), pp))
for n, pp in sorted([l for l in loops if l[1][:,1].max() < 0.30], reverse=True, key=lambda x: x[0]):
    side = 'LEFT' if pp[:,0].mean() > -0.05 else 'RIGHT'
    print(f'  loop {n:4d}v ({side}) Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')

# ---- 4) right-foot junk: wrist-skinned verts at foot level ----
print('\n== verts at foot level (y<0.25) skinned to non-leg joints ==')
mask = lower.pos[:,1] < 0.25
for i in np.where(mask)[0]:
    dom = jnames[lower.jts[i, np.argmax(lower.wts[i])]]
    if dom not in ('j_ankleL','j_ankleR','j_kneeL','j_kneeR','j_hipL','j_hipR','j_footL','j_footR','j_toeL','j_toeR','j_root'):
        p = lower.pos[i]
        print(f'  vert {i}: dom={dom} pos=[{p[0]:+.3f},{p[1]:+.3f},{p[2]:+.3f}] w={lower.wts[i].max():.2f}')

# joint names list for reference
print('\nall joints:', jnames)
