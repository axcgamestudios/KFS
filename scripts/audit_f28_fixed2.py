#!/usr/bin/env python3
"""F28 audit v2 — focused: stray components + near-ground junk in walk pose."""
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
    mm.nrm = read_raw(gltf, buf, p['attributes']['NORMAL']) if 'NORMAL' in p['attributes'] else None
    mm.idx = read_raw(gltf, buf, p['indices']).astype(np.int64).reshape(-1,3)
    if 'JOINTS_0' in p['attributes']:
        mm.jts = read_raw(gltf, buf, p['attributes']['JOINTS_0']).astype(int)
        mm.wts = read_raw(gltf, buf, p['attributes']['WEIGHTS_0'])
    else:
        mm.jts = None
    parts[mm.name] = mm

def components(mesh):
    n = len(mesh.pos)
    parent = np.arange(n)
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for tri in mesh.idx:
        a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
        parent[find(b)] = find(a); parent[find(c)] = find(a)
    return np.array([find(i) for i in range(n)])

for name in ['knight_lower', 'knight_upper']:
    mesh = parts[name]
    roots = components(mesh)
    dom = np.array([jnames[mesh.jts[i, np.argmax(mesh.wts[i])]] if mesh.jts is not None else '?' for i in range(len(mesh.pos))])
    uniq = np.unique(roots)
    print(f'== {name}: {len(uniq)} components ==')
    main_root = None
    sizes = [( (roots==r).sum(), r) for r in uniq]
    sizes.sort(reverse=True)
    main_root = sizes[0][1]
    print(f'  MAIN component: {sizes[0][0]} verts')
    # non-main components that touch ground level (y<0.30) OR are outboard slabs (x>0.21 or x<-0.21)
    for nv, r in sizes[1:]:
        msk = roots == r
        pp = mesh.pos[msk]
        touches_ground = pp[:,1].min() < 0.30
        outboard = pp[:,0].max() > 0.21 or pp[:,0].min() < -0.21
        if touches_ground or outboard:
            from collections import Counter
            cj = Counter(dom[msk]).most_common(3)
            dims = pp.max(0)-pp.min(0)
            print(f'  STRAY root={r}: {nv:5d}v dims=({dims[0]:.2f},{dims[1]:.2f},{dims[2]:.2f})m '
                  f'X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}] joints={[(j,int(c)) for j,c in cj]} ground={touches_ground}')
    # summary of the rest (skirt scales etc.)
    rest = sum(nv for nv, r in sizes[1:])
    rest_strays = 0
    print(f'  (other non-main components: {len(sizes)-1} total, {rest} verts; only ground/outboard ones listed above)')

# ---------- walk pose ----------
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

def node_global(idx):
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

posedG = [node_global(ji) for ji in joint_idx]

def skin(m):
    if m.jts is None:
        return m.pos.copy()
    P = np.concatenate([m.pos, np.ones((len(m.pos),1))], axis=1)
    out = np.zeros((len(m.pos), 4))
    SM = np.array([posedG[k] @ IBM[k] for k in range(len(joint_idx))])
    for c in range(4):
        jcol = m.jts[:, c]; wcol = m.wts[:, c]
        sel = wcol > 1e-6
        if not sel.any(): continue
        Ms = SM[jcol[sel]]
        out[sel] += np.einsum('nij,nj->ni', Ms, P[sel]) * wcol[sel, None]
    return out[:, :3]

lower = parts['knight_lower']
wl = skin(lower)
wu = skin(parts['knight_upper'])

selFoot = lower.pos[:,1] < 0.22
leftFoot = selFoot & (lower.pos[:,0] > -0.05)
rightFoot = selFoot & (lower.pos[:,0] <= -0.05)

print('\nwalk-pose foot rigidity:')
for lbl, sel in [('LEFT ', leftFoot), ('RIGHT', rightFoot)]:
    p0 = lower.pos[sel]; p1 = wl[sel]
    d0 = np.linalg.norm(np.ptp(p0, axis=0)); d1 = np.linalg.norm(np.ptp(p1, axis=0))
    dims0 = p0.max(0)-p0.min(0); dims1 = p1.max(0)-p1.min(0)
    print(f'  {lbl}: bind diag {d0:.3f}m -> posed {d1:.3f}m; dims ({dims0[0]:.2f},{dims0[1]:.2f},{dims0[2]:.2f})->({dims1[0]:.2f},{dims1[1]:.2f},{dims1[2]:.2f})')

# near-ground audit: posed y<0.35, non-foot
print('\nwalk-pose near-ground (y<0.35) non-foot verts:')
for mname, posed, bind in [('knight_lower', wl, lower.pos), ('knight_upper', wu, parts['knight_upper'].pos)]:
    msk = (posed[:,1] < 0.35)
    if mname == 'knight_lower':
        msk = msk & ~selFoot
    pp = posed[msk]
    print(f'  {mname}: {len(pp)} verts  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]' if len(pp) else f'  {mname}: none')
    # between-feet corridor in posed space
    if len(pp):
        cor = pp[(pp[:,0] > -0.10) & (pp[:,0] < 0.12)]
        print(f'    corridor |x|<~0.1: {len(cor)}', end='')
        if len(cor):
            print(f'  Y[{cor[:,1].min():+.3f},{cor[:,1].max():+.3f}] Z[{cor[:,2].min():+.3f},{cor[:,2].max():+.3f}]')
        else:
            print()

# posed feet positions for reference
for lbl, sel in [('LEFT foot', leftFoot), ('RIGHT foot', rightFoot)]:
    p1 = wl[sel]
    print(f'  posed {lbl}: Y[{p1[:,1].min():+.3f},{p1[:,1].max():+.3f}] X[{p1[:,0].min():+.3f},{p1[:,0].max():+.3f}] Z[{p1[:,2].min():+.3f},{p1[:,2].max():+.3f}]')

# where do the stray slab verts go in the walk pose (j_root -> static)?
roots_l = components(lower)
import collections
sizes = [( (roots_l==r).sum(), r) for r in np.unique(roots_l)]
sizes.sort(reverse=True)
main_root = sizes[0][1]
print('\nstray slab (non-main, outboard x>0.21) verts in WALK pose:')
stray = np.zeros(len(lower.pos), dtype=bool)
for nv, r in sizes[1:]:
    msk = roots_l == r
    if lower.pos[msk][:,0].max() > 0.21:
        stray |= msk
ps = wl[stray]
print(f'  {stray.sum()} verts: X[{ps[:,0].min():+.3f},{ps[:,0].max():+.3f}] Y[{ps[:,1].min():+.3f},{ps[:,1].max():+.3f}] Z[{ps[:,2].min():+.3f},{ps[:,2].max():+.3f}]')
np.save('/tmp/stray_mask.npy', stray)
