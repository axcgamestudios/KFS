#!/usr/bin/env python3
"""Ground-truth renderer for knight_rigged.glb (current, post-surgery).
Bind-pose + skinned walk-pose renders, plus boundary-edge (hole) analysis.
Output: /home/z/my-project/scripts/shots_f28/gt_*.png
"""
import json, struct
import numpy as np
from PIL import Image

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
        elif comp == 1: out[k] = struct.unpack_from('<I', buf, po)[0]
        elif comp == 16: out[k] = struct.unpack_from('<16f', buf, po)
    return out

gltf, buf = load(PATH)
nodes = gltf['nodes']
meshes = gltf['meshes']
skin = gltf['skins'][0]
joint_idx = skin['joints']
jnames = [nodes[j]['name'] for j in joint_idx]
IBM = read_raw(gltf, buf, skin['inverseBindMatrices']).reshape(-1,4,4)

# ---------- geometry ----------
class Mesh:
    pass
ms = []
for mi, m in enumerate(meshes):
    if m.get('name') == 'knight_shield':
        continue  # shield prop hidden, like the shots
    p = m['primitives'][0]
    mm = Mesh()
    mm.name = m.get('name')
    mm.pos = read_raw(gltf, buf, p['attributes']['POSITION'])
    mm.nrm = read_raw(gltf, buf, p['attributes']['NORMAL'])
    mm.idx = read_raw(gltf, buf, p['indices']).astype(np.int64).reshape(-1,3)
    if 'JOINTS_0' in p['attributes']:
        mm.jts = read_raw(gltf, buf, p['attributes']['JOINTS_0']).astype(int)
        mm.wts = read_raw(gltf, buf, p['attributes']['WEIGHTS_0'])
    else:
        mm.jts = None
    ms.append(mm)
    print(f'{mm.name}: {len(mm.pos)} verts, {len(mm.idx)} tris')

# ---------- skeleton ----------
def local_matrix(n):
    T = np.array(n.get('translation', [0,0,0]), dtype=float)
    q = np.array(n.get('rotation', [0,0,0,1]), dtype=float)
    x,y,z,w = q
    R = np.array([
        [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
        [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    S = np.array(n.get('scale', [1,1,1]), dtype=float)
    M = np.eye(4)
    M[:3,:3] = R * S
    M[:3,3] = T
    return M

def node_global(idx, rot_extra=None, cache=None):
    """global transform of node idx, with optional extra local rotations {node_idx: axis-angle}"""
    chain = []
    i = idx
    while i is not None:
        chain.append(i)
        i = parent.get(i)
    chain = chain[::-1]
    G = np.eye(4)
    for c in chain:
        M = local_matrix(nodes[c])
        if rot_extra and c in rot_extra:
            M = rot_extra[c] @ M
        G = G @ M
    return G

parent = {}
for i, n in enumerate(nodes):
    for c in n.get('children', []):
        parent[c] = i

# ---------- hole analysis on knight_lower ----------
lower = [m for m in ms if m.name == 'knight_lower'][0]
edges = {}
tris = lower.idx
for t in tris:
    for a, b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0])):
        key = (min(a,b), max(a,b))
        edges[key] = edges.get(key, 0) + 1
boundary = [k for k, v in edges.items() if v == 1]
print(f'\nknight_lower boundary edges (holes): {len(boundary)} of {len(edges)} edges')
if boundary:
    be = np.array(boundary)
    bpos = lower.pos[be[:,0]]
    for label, msk in [('left foot  (x>-0.05, y<0.22)', (bpos[:,0]>-0.05)&(bpos[:,1]<0.22)),
                       ('right foot (x<=-0.05, y<0.22)', (bpos[:,0]<=-0.05)&(bpos[:,1]<0.22)),
                       ('shins      (0.22<=y<0.75)', (bpos[:,1]>=0.22)&(bpos[:,1]<0.75)),
                       ('hips/up    (y>=0.75)', (bpos[:,1]>=0.75))]:
        if msk.sum():
            pp = bpos[msk]
            print(f'  {label}: {msk.sum()} boundary edges, X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')

# foot dimension report
print('\nfoot dims (y<0.22):')
foot = lower.pos[lower.pos[:,1] < 0.22]
for lbl, m in [('LEFT  (x>-0.05)', foot[:,0] > -0.05), ('RIGHT (x<=-0.05)', foot[:,0] <= -0.05)]:
    pp = foot[m]
    print(f'  {lbl}: {len(pp)} verts  len_Z={pp[:,2].max()-pp[:,2].min():.3f}m  wid_X={pp[:,0].max()-pp[:,0].min():.3f}m  hei_Y={pp[:,1].max()-pp[:,1].min():.3f}m  Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')

# ---------- renderer ----------
def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    M = np.eye(4); M[1,1]=c; M[1,2]=-s; M[2,1]=s; M[2,2]=c
    return M

def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    M = np.eye(4); M[0,0]=c; M[0,2]=s; M[1,1]=1; M[2,0]=-s; M[2,2]=c
    return M

def render(out, meshes, eye, target, up, fov_y_deg, W=820, H=940, grid=True):
    eye = np.array(eye, float); target = np.array(target, float); up = np.array(up, float)
    fwd = target - eye; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, up); right /= np.linalg.norm(right)
    upv = np.cross(right, fwd)
    f = (H/2) / np.tan(np.radians(fov_y_deg)/2)
    img = np.zeros((H, W, 3))
    zbuf = np.full((H, W), 1e30)
    # background: gray-blue with floor grid
    bg_top = np.array([64, 74, 88]); bg_bot = np.array([46, 54, 66])
    for y in range(H):
        img[y] = bg_top + (bg_bot - bg_top) * y / H
    if grid:
        # project ground-grid lines y=0, x/z in [-4,4], 1m step
        for g in range(-4, 5):
            for a, b in [((g, 0, -4), (g, 0, 4)), ((-4, 0, g), (4, 0, g))]:
                pts = []
                for P in (a, b):
                    P = np.array(P, float)
                    d = P - eye
                    x = d @ right; y = d @ upv; z = d @ fwd
                    if z <= 0.01: pts = None; break
                    pts.append((W/2 + f*x/z, H/2 - f*y/z, z))
                if pts:
                    (x0,y0,z0),(x1,y1,z1) = pts
                    n = int(max(abs(x1-x0), abs(y1-y0)))+1
                    for k in range(n+1):
                        x = x0 + (x1-x0)*k/n; y = y0 + (y1-y0)*k/n
                        z = z0 + (z1-z0)*k/n
                        xi, yi = int(round(x)), int(round(y))
                        if 0 <= xi < W and 0 <= yi < H and z < zbuf[yi, xi]:
                            zbuf[yi, xi] = z
                            img[yi, xi] = np.array([84, 96, 108])
    L1 = np.array([0.4, 0.8, 0.45]); L1 /= np.linalg.norm(L1)
    L2 = np.array([-0.5, 0.3, -0.6]); L2 /= np.linalg.norm(L2)
    for m in meshes:
        P = m.pos
        N = m.nrm
        V = P - eye
        z = V @ fwd
        x = V @ right
        y = V @ upv
        ok = z > 0.05
        sx = W/2 + f*x/z; sy = H/2 - f*y/z
        tris = m.idx
        # backface + frustum culling per triangle via centroid
        for t in tris:
            if not (ok[t[0]] and ok[t[1]] and ok[t[2]]):
                continue
            xs = sx[t]; ys = sy[t]; zs = z[t]
            if xs.max() < 0 or xs.min() >= W or ys.max() < 0 or ys.min() >= H:
                continue
            n = N[t[0]]  # flat shading
            lam = max(0.0, n @ L1)*0.62 + max(0.0, n @ L2)*0.25 + 0.18
            base = np.array([150, 152, 158]) if m.name != 'knight_lower' else np.array([158, 150, 140])
            col = np.clip(base * lam, 0, 255)
            x0, x1 = int(max(0, np.floor(xs.min()))), int(min(W-1, np.ceil(xs.max())))
            y0, y1 = int(max(0, np.floor(ys.min()))), int(min(H-1, np.ceil(ys.max())))
            if x1 < x0 or y1 < y0: continue
            ax, ay = xs[0], ys[0]; bx, by = xs[1], ys[1]; cx, cy = xs[2], ys[2]
            d = (by-ay)*(cx-ax) - (bx-ax)*(cy-ay)
            if abs(d) < 1e-9: continue
            for yy in range(y0, y1+1):
                for xx in range(x0, x1+1):
                    w1 = ((yy-ay)*(cx-ax) - (xx-ax)*(cy-ay)) / d
                    w2 = ((xx-ax)*(by-ay) - (yy-ay)*(bx-ax)) / d
                    w0 = 1 - w1 - w2
                    if w0 < -1e-6 or w1 < -1e-6 or w2 < -1e-6: continue
                    zz = w0*zs[0] + w1*zs[1] + w2*zs[2]
                    if zz < zbuf[yy, xx]:
                        zbuf[yy, xx] = zz
                        img[yy, xx] = col
    Image.fromarray(img.astype(np.uint8)).save(out)
    print('saved', out)

# ---------- bind pose renders (mesh space == world: nodes 15/16 have no TRS) ----------
upper = [m for m in ms if m.name == 'knight_upper'][0]
sword = [m for m in ms if m.name == 'knight_sword']
bind_meshes = [upper, lower] # + sword  (sword hangs from right wrist)

# full body front: camera in front (+Z), looking -Z; model-left (+X) appears screen-right
render('/home/z/my-project/scripts/shots_f28/gt_front.png', bind_meshes,
       eye=(0, 1.0, 4.2), target=(0, 1.0, 0), up=(0,1,0), fov_y_deg=32)
# feet closeup front
render('/home/z/my-project/scripts/shots_f28/gt_feet.png', bind_meshes,
       eye=(0, 0.18, 1.35), target=(0, 0.14, 0), up=(0,1,0), fov_y_deg=26)

# ---------- walk pose (proper LBS skinning) ----------
# pose: left leg swung BACK, right leg forward
extra = {}
jn = {n: i for i, n in enumerate(jnames)}
node_of = {jnames[k]: joint_idx[k] for k in range(len(joint_idx))}
extra[node_of['j_hipL']]  = rot_x(+0.55)          # left leg back
extra[node_of['j_kneeL']] = rot_x(+0.35)
extra[node_of['j_hipR']]  = rot_x(-0.50)          # right leg forward
extra[node_of['j_kneeR']] = rot_x(+0.25)
extra[node_of['j_torso']] = rot_y(0.10)
extra[node_of['j_shoulderL']] = rot_x(-0.3)
extra[node_of['j_shoulderR']] = rot_x(0.25)

posedG = {}
for k, ji in enumerate(joint_idx):
    posedG[k] = node_global(ji, rot_extra=extra)

def skin(m):
    if m.jts is None:
        return m.pos.copy(), m.nrm.copy()
    P = np.concatenate([m.pos, np.ones((len(m.pos),1))], axis=1)  # N,4
    out = np.zeros((len(m.pos), 4)); outn = np.zeros((len(m.pos), 3))
    SM = np.array([posedG[k] @ IBM[k] for k in range(len(joint_idx))])
    for c in range(4):
        jcol = m.jts[:, c]; wcol = m.wts[:, c]
        sel = wcol > 1e-6
        if not sel.any(): continue
        Ms = SM[jcol[sel]]                      # (n,4,4)
        out[sel] += np.einsum('nij,nj->ni', Ms, P[sel]) * wcol[sel, None]
        outn[sel] += np.einsum('nij,nj->ni', Ms[:, :3, :3], m.nrm[sel]) * wcol[sel, None]
    return out[:, :3], outn

wm = Mesh(); wm.name = 'walk_lower'; wm.pos, wm.nrm = skin(lower); wm.idx = lower.idx; wm.jts = None
wu = Mesh(); wu.name = 'walk_upper'; wu.pos, wu.nrm = skin(upper); wu.idx = upper.idx; wu.jts = None

# foot rigidity check: measure foot dims after skinning
fl = wm.pos[lower.pos[:,1] < 0.22][:, :]  # same vert selection as bind
selL = lower.pos[:,1] < 0.22
pL = wm.pos[selL & (lower.pos[:,0] > -0.05)]
pR = wm.pos[selL & (lower.pos[:,0] <= -0.05)]
print('\nwalk-pose foot dims (same verts as bind):')
for lbl, pp0, pp1 in [('LEFT ', lower.pos[selL & (lower.pos[:,0] > -0.05)], pL),
                      ('RIGHT', lower.pos[selL & (lower.pos[:,0] <= -0.05)], pR)]:
    d0 = np.linalg.norm(np.ptp(pp0, axis=0)); d1 = np.linalg.norm(np.ptp(pp1, axis=0))
    print(f'  {lbl}: bind bbox diag {d0:.3f}m -> posed bbox diag {d1:.3f}m; posed Y[{pp1[:,1].min():+.3f},{pp1[:,1].max():+.3f}] Z[{pp1[:,2].min():+.3f},{pp1[:,2].max():+.3f}]')
    # per-vertex displacement spread from rigid: compare pairwise distances sample
    idx0 = np.random.RandomState(0).choice(len(pp0), min(300, len(pp0)), replace=False)
    a = pp0[idx0]; b = pp1[idx0]
    c0 = a.mean(0); c1 = b.mean(0)
    r0 = np.linalg.norm(a - c0, axis=1); r1 = np.linalg.norm(b - c1, axis=1)
    print(f'         radial spread bind {r0.std():.4f} -> posed {r1.std():.4f} (rigid if similar)')

# walk side view (from knight's left = +X side)
render('/home/z/my-project/scripts/shots_f28/gt_walk_left.png', [wu, wm],
       eye=(3.0, 0.65, 0.9), target=(0, 0.55, 0.05), up=(0,1,0), fov_y_deg=36)
# walk feet from front-right low angle (right = -X, front = +Z)
render('/home/z/my-project/scripts/shots_f28/gt_walk_feet.png', [wu, wm],
       eye=(-1.1, 0.35, 1.6), target=(-0.05, 0.10, 0.05), up=(0,1,0), fov_y_deg=34)
print('done')
