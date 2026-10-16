#!/usr/bin/env python3
"""Render the current glb with stray slab geometry highlighted red.
Views: front (bind), left side (bind), walk-feet low angle (posed)."""
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
    mm.nrm = read_raw(gltf, buf, p['attributes']['NORMAL'])
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

lower = parts['knight_lower']
upper = parts['knight_upper']
roots = components(lower)
sizes = sorted([((roots==r).sum(), r) for r in np.unique(roots)], reverse=True)
main_root = sizes[0][1]

# stray = the static (j_root) slab components outboard (+X) of the left leg
dom = np.array([jnames[lower.jts[i, np.argmax(lower.wts[i])]] for i in range(len(lower.pos))])
stray = np.zeros(len(lower.pos), dtype=bool)
n_slab_comps = 0
for nv, r in sizes[1:]:
    msk = roots == r
    pp = lower.pos[msk]
    root_share = (dom[msk] == 'j_root').mean()
    if pp[:,0].max() > 0.20 and pp[:,1].min() > 0.25 and pp[:,1].max() < 1.05 and root_share > 0.9:
        stray |= msk; n_slab_comps += 1
print('stray slab comps:', n_slab_comps, 'verts:', stray.sum())
pp = lower.pos[stray]
print('slab bbox: X[%.3f,%.3f] Y[%.3f,%.3f] Z[%.3f,%.3f]' % (pp[:,0].min(),pp[:,0].max(),pp[:,1].min(),pp[:,1].max(),pp[:,2].min(),pp[:,2].max()))
tri_stray = np.array([stray[t[0]] or stray[t[1]] or stray[t[2]] for t in lower.idx])

# ---------- pose machinery ----------
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

def skin(m, G):
    if m.jts is None:
        return m.pos.copy(), m.nrm.copy()
    P = np.concatenate([m.pos, np.ones((len(m.pos),1))], axis=1)
    out = np.zeros((len(m.pos), 4)); outn = np.zeros((len(m.pos), 3))
    SM = np.array([G[k] @ IBM[k] for k in range(len(joint_idx))])
    for c in range(4):
        jcol = m.jts[:, c]; wcol = m.wts[:, c]
        sel = wcol > 1e-6
        if not sel.any(): continue
        Ms = SM[jcol[sel]]
        out[sel] += np.einsum('nij,nj->ni', Ms, P[sel]) * wcol[sel, None]
        outn[sel] += np.einsum('nij,nj->ni', Ms[:, :3, :3], m.nrm[sel]) * wcol[sel, None]
    return out[:, :3], outn

bindG = [node_global.__wrapped__(ji) if hasattr(node_global,'__wrapped__') else None for ji in joint_idx]
# bind pose: global without extra
def node_global_bind(idx):
    chain = []
    i = idx
    while i is not None:
        chain.append(i); i = parent.get(i)
    G = np.eye(4)
    for c in chain[::-1]:
        G = G @ local_matrix(nodes[c])
    return G
bindG = [node_global_bind(ji) for ji in joint_idx]

wl, wln = skin(lower, posedG)
wu, wun = skin(upper, posedG)
bl, bln = skin(lower, bindG)
bu, bun = skin(upper, bindG)

def render(out, items, eye, target, up, fov_y_deg, W=820, H=940):
    eye = np.array(eye, float); target = np.array(target, float); up = np.array(up, float)
    fwd = target - eye; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, up); right /= np.linalg.norm(right)
    upv = np.cross(right, fwd)
    f = (H/2) / np.tan(np.radians(fov_y_deg)/2)
    img = np.zeros((H, W, 3)); zbuf = np.full((H, W), 1e30)
    bg_top = np.array([64, 74, 88]); bg_bot = np.array([46, 54, 66])
    for y in range(H):
        img[y] = bg_top + (bg_bot - bg_top) * y / H
    for g in range(-4, 5):
        for a, b in [((g, 0, -4), (g, 0, 4)), ((-4, 0, g), (4, 0, g))]:
            pts = []
            for P in (a, b):
                P = np.array(P, float); d = P - eye
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
                        zbuf[yi, xi] = z; img[yi, xi] = np.array([84, 96, 108])
    L1 = np.array([0.4, 0.8, 0.45]); L1 /= np.linalg.norm(L1)
    L2 = np.array([-0.5, 0.3, -0.6]); L2 /= np.linalg.norm(L2)
    for (pos, nrm, idx, hot) in items:
        V = pos - eye
        z = V @ fwd; x = V @ right; y = V @ upv
        ok = z > 0.05
        sx = W/2 + f*x/z; sy = H/2 - f*y/z
        for t in idx:
            if not (ok[t[0]] and ok[t[1]] and ok[t[2]]): continue
            xs = sx[t]; ys = sy[t]; zs = z[t]
            if xs.max() < 0 or xs.min() >= W or ys.max() < 0 or ys.min() >= H: continue
            n = nrm[t[0]]
            lam = max(0.0, n @ L1)*0.62 + max(0.0, n @ L2)*0.25 + 0.18
            base = np.array([158, 150, 140]) if not hot else np.array([220, 40, 40])
            col = np.clip(base * (lam if not hot else max(lam, 0.75)), 0, 255)
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
                        zbuf[yy, xx] = zz; img[yy, xx] = col
    Image.fromarray(img.astype(np.uint8)).save(out)
    print('saved', out)

# bind front (full body) with slab highlighted
remap = np.full(len(lower.pos), -1, dtype=np.int64)
remap[np.where(stray)[0]] = np.arange(int(stray.sum()))
slab_idx = remap[lower.idx[tri_stray]]  # compact indices into the 884-vert slab arrays
render('/home/z/my-project/scripts/shots_f28/dbg_slab_front.png',
       [(bu, bun, upper.idx, False),
        (bl, bln, lower.idx[~tri_stray], False),
        (bl[stray], bln[stray], slab_idx, True)],
       eye=(0, 1.0, 4.2), target=(0, 1.0, 0), up=(0,1,0), fov_y_deg=32)

# slab-only view: front
render('/home/z/my-project/scripts/shots_f28/dbg_slab_only.png',
       [(bl[stray], bln[stray], slab_idx, True)],
       eye=(0.33, 0.66, 3.0), target=(0.33, 0.66, 0.05), up=(0,1,0), fov_y_deg=40)

# walk pose, front-right low angle (like fixed2_walkfeet), slab highlighted
render('/home/z/my-project/scripts/shots_f28/dbg_slab_walkfeet.png',
       [(wu, wun, upper.idx, False),
        (wl, wln, lower.idx[~tri_stray], False),
        (wl[stray], wln[stray], slab_idx, True)],
       eye=(-1.1, 0.35, 1.6), target=(-0.05, 0.10, 0.05), up=(0,1,0), fov_y_deg=34)

# walk pose side view (like fixed2_walk) with slab highlighted
render('/home/z/my-project/scripts/shots_f28/dbg_slab_walkside.png',
       [(wu, wun, upper.idx, False),
        (wl, wln, lower.idx[~tri_stray], False),
        (wl[stray], wln[stray], slab_idx, True)],
       eye=(3.0, 0.65, 0.9), target=(0, 0.55, 0.05), up=(0,1,0), fov_y_deg=36)
