#!/usr/bin/env python3
"""FINAL v8 audit — quantitative answers for the 5 release questions.
Checks on current knight_rigged.glb:
 1. Ghost hilt remnant (sword axis zone, knight_upper, right arm)
 2. Belt/waist continuity (boundary-edge holes near belt) both meshes
 3. Floating islands (connected components) both meshes
 4. Foot dims + symmetry (bind) and walk-pose rigidity (radial spread)
 5. Slab/kill-zone leftovers in knight_lower (x>0.16 flank zone etc.)
"""
import json, struct
import numpy as np

PATH = '/home/z/my-project/public/game/models/knight_rigged.glb'

def load(path):
    with open(path, 'rb') as f: data = f.read()
    jl, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+jl].decode())
    bo = 20 + jl
    while bo % 4: bo += 1
    bl, _ = struct.unpack_from('<II', data, bo)
    return gltf, data[bo+8:bo+8+bl]

TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
FMT = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}

def rr(g, buf, ai):
    acc = g['accessors'][ai]; bv = g['bufferViews'][acc['bufferView']]
    comp = TYPES[acc['type']]; fmt = FMT[acc['componentType']]
    n, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    st = bv.get('byteStride',0) or struct.calcsize('<'+fmt)*comp
    out = np.empty((n, comp), dtype=np.float64)
    for k in range(n):
        po = off+k*st
        if comp == 3: out[k] = struct.unpack_from('<3f', buf, po)
        elif comp == 4:
            if acc['componentType'] == 5121: out[k] = struct.unpack_from('<4B', buf, po)
            elif acc['componentType'] == 5123: out[k] = struct.unpack_from('<4H', buf, po)
            else: out[k] = struct.unpack_from('<4f', buf, po)
        elif comp == 2: out[k] = struct.unpack_from('<2f', buf, po)
        elif comp == 1: out[k] = struct.unpack_from('<I' if acc['componentType']==5125 else '<'+fmt, buf, po)[0]
        elif comp == 16: out[k] = struct.unpack_from('<16f', buf, po)
    return out

g, buf = load(PATH)
nodes = g['nodes']; meshes = g['meshes']; skin = g['skins'][0]
joint_idx = skin['joints']
jnames = [nodes[j]['name'] for j in joint_idx]
IBM = rr(g, buf, skin['inverseBindMatrices']).reshape(-1,4,4)

class M: pass
ms = {}
for m in meshes:
    if m.get('name') == 'knight_shield': continue
    p = m['primitives'][0]; mm = M(); mm.name = m.get('name')
    mm.pos = rr(g, buf, p['attributes']['POSITION'])
    mm.nrm = rr(g, buf, p['attributes']['NORMAL'])
    mm.idx = rr(g, buf, p['indices']).astype(np.int64).reshape(-1,3)
    if 'JOINTS_0' in p['attributes']:
        mm.jts = rr(g, buf, p['attributes']['JOINTS_0']).astype(int)
        mm.wts = rr(g, buf, p['attributes']['WEIGHTS_0'])
        mm.dom = np.array([jnames[mm.jts[i, np.argmax(mm.wts[i])]] for i in range(len(mm.pos))])
    else: mm.jts = None; mm.dom = None
    ms[mm.name] = mm
    print(f'{mm.name}: {len(mm.pos)} verts, {len(mm.idx)} tris')

upper, lower = ms['knight_upper'], ms['knight_lower']

def components(mesh):
    """connected components via union-find on triangle indices"""
    parent = np.arange(len(mesh.pos))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for t in mesh.idx:
        a, b, c = find(t[0]), find(t[1]), find(t[2])
        parent[b] = a; parent[c] = a
    roots = np.array([find(i) for i in range(len(mesh.pos))])
    return roots

print('\n===== FLOATING ISLANDS / CONNECTED COMPONENTS =====')
for name, mesh in [('knight_upper', upper), ('knight_lower', lower)]:
    roots = components(mesh)
    uniq, counts = np.unique(roots, return_counts=True)
    order = np.argsort(-counts)
    print(f'\n{name}: {len(uniq)} components')
    for rank, oi in enumerate(order[:12]):
        r = uniq[oi]; n = counts[oi]
        sel = roots == r
        pp = mesh.pos[sel]
        bones = {}
        if mesh.dom is not None:
            for b in mesh.dom[sel]:
                bones[b] = bones.get(b, 0) + 1
            top = sorted(bones.items(), key=lambda kv: -kv[1])[:3]
            bstr = ','.join(f'{k}:{v}' for k, v in top)
        else: bstr = '-'
        flag = '  <== SMALL ISLAND (junk?)' if n < 400 else ''
        print(f'  #{rank}: {n:6d} verts  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] '
              f'Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}] bones[{bstr}]{flag}')

print('\n===== BOUNDARY EDGES (HOLES) =====')
for name, mesh in [('knight_upper', upper), ('knight_lower', lower)]:
    edges = {}
    for t in mesh.idx:
        for a, b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0])):
            k = (min(a,b), max(a,b)); edges[k] = edges.get(k, 0) + 1
    bnd = [k for k, v in edges.items() if v == 1]
    be = np.array(bnd); bpos = mesh.pos[be[:,0]]
    print(f'\n{name}: {len(bnd)} boundary edges / {len(edges)} total')
    zones = [('belt/waist  (y 0.90-1.10)', (bpos[:,1]>0.90)&(bpos[:,1]<=1.10)),
             ('left foot   (x>-0.05, y<0.22)', (bpos[:,0]>-0.05)&(bpos[:,1]<0.22)),
             ('right foot  (x<=-0.05, y<0.22)', (bpos[:,0]<=-0.05)&(bpos[:,1]<0.22)),
             ('shins       (y 0.22-0.75)', (bpos[:,1]>=0.22)&(bpos[:,1]<0.75)),
             ('hips/skirt  (y 0.75-0.90)', (bpos[:,1]>=0.75)&(bpos[:,1]<=0.90)),
             ('above belt  (y>1.10)', (bpos[:,1]>1.10))]
    for lbl, msk in zones:
        if msk.sum():
            pp = bpos[msk]
            print(f'  {lbl}: {msk.sum():4d} edges  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] '
                  f'Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')

print('\n===== GHOST HILT ZONE (knight_upper, right arm) =====')
ax_x, bx_x = 0.0680, -0.2673
az_z, bz_z = -0.0378, 0.2022
cx = ax_x*upper.pos[:,1] + bx_x; cz = az_z*upper.pos[:,1] + bz_z
dist = np.sqrt((upper.pos[:,0]-cx)**2 + (upper.pos[:,2]-cz)**2)
zone = (upper.pos[:,1] > 0.90) & (upper.pos[:,1] < 1.12) & (dist < 0.055)
print(f'verts within 55mm of sword axis, y 0.90-1.12: {zone.sum()}')
if zone.sum():
    pp = upper.pos[zone]
    print(f'  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')
    print(f'  bones: {dict(zip(*np.unique(upper.dom[zone], return_counts=True)))}')
# wider: anything skinned to right wrist/elbow below y 1.05 that is far from body axis
wr = (upper.dom == 'j_wristR')
if wr.sum():
    pp = upper.pos[wr]
    print(f'j_wristR verts: {wr.sum()}  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')

print('\n===== SLAB / FLANK KILL ZONES LEFTOVERS (knight_lower) =====')
zones = {'flank slab (x>0.16, y 0.25-1.06)': (lower.pos[:,0]>0.16)&(lower.pos[:,1]>0.25)&(lower.pos[:,1]<1.06),
         'x>0.203 (old slab max)': (lower.pos[:,0]>0.203),
         'left leg region x 0.10-0.203': (lower.pos[:,0]>0.10)&(lower.pos[:,0]<=0.203)}
for lbl, msk in zones.items():
    print(f'{lbl}: {msk.sum()} verts')
    if msk.sum():
        pp = lower.pos[msk]
        print(f'  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')
        print(f'  bones: {dict(zip(*np.unique(lower.dom[msk], return_counts=True)))}')

print('\n===== FOOT DIMS (bind pose, y<0.22) =====')
selF = lower.pos[:,1] < 0.22
for lbl, m in [('LEFT  (x>-0.05)', selF & (lower.pos[:,0] > -0.05)),
               ('RIGHT (x<=-0.05)', selF & (lower.pos[:,0] <= -0.05))]:
    pp = lower.pos[m]
    if len(pp) == 0: print(f'{lbl}: EMPTY'); continue
    print(f'{lbl}: {len(pp):5d} verts  len_Z={pp[:,2].max()-pp[:,2].min():.3f}m wid_X={pp[:,0].max()-pp[:,0].min():.3f}m '
          f'hei_Y={pp[:,1].max()-pp[:,1].min():.3f}m  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] '
          f'Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')

# ---------- walk pose rigidity ----------
def local_matrix(n):
    T = np.array(n.get('translation',[0,0,0]),float)
    q = np.array(n.get('rotation',[0,0,0,1]),float); x,y,z,w = q
    R = np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                  [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                  [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    S = np.array(n.get('scale',[1,1,1]),float)
    M = np.eye(4); M[:3,:3] = R*S; M[:3,3] = T
    return M
parent = {}
for i, n in enumerate(nodes):
    for c in n.get('children', []): parent[c] = i
def node_global(idx, rot_extra=None):
    chain = []; i = idx
    while i is not None: chain.append(i); i = parent.get(i)
    G = np.eye(4)
    for c in chain[::-1]:
        M = local_matrix(nodes[c])
        if rot_extra and c in rot_extra: M = rot_extra[c] @ M
        G = G @ M
    return G
def rot_x(a):
    c,s = np.cos(a),np.sin(a); M=np.eye(4); M[1,1]=c;M[1,2]=-s;M[2,1]=s;M[2,2]=c; return M
def rot_y(a):
    c,s = np.cos(a),np.sin(a); M=np.eye(4); M[0,0]=c;M[0,2]=s;M[2,0]=-s;M[2,2]=c; return M

jn = {n: i for i, n in enumerate(jnames)}
node_of = {jnames[k]: joint_idx[k] for k in range(len(joint_idx))}
extra = {node_of['j_hipL']: rot_x(+0.55), node_of['j_kneeL']: rot_x(+0.35),
         node_of['j_hipR']: rot_x(-0.50), node_of['j_kneeR']: rot_x(+0.25),
         node_of['j_torso']: rot_y(0.10),
         node_of['j_shoulderL']: rot_x(-0.3), node_of['j_shoulderR']: rot_x(0.25)}
posedG = {k: node_global(ji, rot_extra=extra) for k, ji in enumerate(joint_idx)}

def skin(mesh):
    if mesh.jts is None: return mesh.pos.copy()
    P = np.concatenate([mesh.pos, np.ones((len(mesh.pos),1))], axis=1)
    out = np.zeros((len(mesh.pos), 4))
    SM = np.array([posedG[k] @ IBM[k] for k in range(len(joint_idx))])
    for c in range(4):
        jc, wc = mesh.jts[:,c], mesh.wts[:,c]
        sel = wc > 1e-6
        if not sel.any(): continue
        out[sel] += np.einsum('nij,nj->ni', SM[jc[sel]], P[sel]) * wc[sel,None]
    return out[:,:3]

wl = skin(lower)
print('\n===== WALK-POSE FOOT RIGIDITY =====')
for lbl, m in [('LEFT ', selF & (lower.pos[:,0] > -0.05)),
               ('RIGHT', selF & (lower.pos[:,0] <= -0.05))]:
    p0 = lower.pos[m]; p1 = wl[m]
    d0 = np.linalg.norm(np.ptp(p0,axis=0)); d1 = np.linalg.norm(np.ptp(p1,axis=0))
    rs = np.random.RandomState(0)
    idx0 = rs.choice(len(p0), min(300,len(p0)), replace=False)
    a = p0[idx0]; b = p1[idx0]
    r0 = np.linalg.norm(a - a.mean(0), axis=1); r1 = np.linalg.norm(b - b.mean(0), axis=1)
    print(f'{lbl}: bind diag {d0:.3f}m -> posed diag {d1:.3f}m | radial spread bind {r0.std():.4f} -> posed {r1.std():.4f}'
          f' | posed Y[{p1[:,1].min():+.3f},{p1[:,1].max():+.3f}]')
    # vertical smear: any posed verts far below the boot sole (y<-0.02)?
    below = p1[p1[:,1] < -0.02]
    if len(below): print(f'        !! {len(below)} verts below y=-0.02 (smear/ground clip), min y={below[:,1].min():+.3f}')
print('\nDONE')
