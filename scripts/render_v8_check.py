#!/usr/bin/env python3
"""Render current GLB at known cameras + variants to pixel-check defects:
 - belt hole (right hip) via scanline bg-gap analysis
 - foot spike verts (walk pose) via with/without rendering
 - left-rear hip fragments visibility
"""
import json, struct, sys
import numpy as np
from PIL import Image

PATH = '/home/z/my-project/public/game/models/knight_rigged.glb'
OUT = '/tmp/v8check'

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
nodes = g['nodes']; skin = g['skins'][0]
joint_idx = skin['joints']
jnames = [nodes[j]['name'] for j in joint_idx]
IBM = rr(g, buf, skin['inverseBindMatrices']).reshape(-1,4,4)

class M: pass
ms = {}
for m in g['meshes']:
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
upper, lower = ms['knight_upper'], ms['knight_lower']

def local_matrix(n):
    T = np.array(n.get('translation',[0,0,0]),float)
    q = np.array(n.get('rotation',[0,0,0,1]),float); x,y,z,w = q
    R = np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                  [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                  [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    Mm = np.eye(4); Mm[:3,:3]=R; Mm[:3,3]=T
    return Mm
par = {}
for i, n in enumerate(nodes):
    for ch in n.get('children', []): par[ch]=i
def ng(idx, rx=None):
    chain=[]; i=idx
    while i is not None: chain.append(i); i=par.get(i)
    G = np.eye(4)
    for cnode in chain[::-1]:
        Mm = local_matrix(nodes[cnode])
        if rx and cnode in rx: Mm = rx[cnode] @ Mm
        G = G @ Mm
    return G
def rot_x(a):
    c,s=np.cos(a),np.sin(a); Mm=np.eye(4); Mm[1,1]=c;Mm[1,2]=-s;Mm[2,1]=s;Mm[2,2]=c; return Mm
def rot_y(a):
    c,s=np.cos(a),np.sin(a); Mm=np.eye(4); Mm[0,0]=c;Mm[0,2]=s;Mm[2,0]=-s;Mm[2,2]=c; return Mm
jn = {n: i for i, n in enumerate(jnames)}
node_of = {jnames[k]: joint_idx[k] for k in range(len(joint_idx))}
extra = {node_of['j_hipL']: rot_x(+0.55), node_of['j_kneeL']: rot_x(+0.35),
         node_of['j_hipR']: rot_x(-0.50), node_of['j_kneeR']: rot_x(+0.25),
         node_of['j_torso']: rot_y(0.10),
         node_of['j_shoulderL']: rot_x(-0.3), node_of['j_shoulderR']: rot_x(0.25)}
posedG = {k: ng(ji, extra) for k, ji in enumerate(joint_idx)}

def skin(mesh):
    if mesh.jts is None: return mesh.pos.copy(), mesh.nrm.copy()
    P = np.concatenate([mesh.pos, np.ones((len(mesh.pos),1))], axis=1)
    out = np.zeros((len(mesh.pos),4)); outn = np.zeros((len(mesh.pos),3))
    SM = np.array([posedG[k] @ IBM[k] for k in range(len(joint_idx))])
    for c in range(4):
        jc, wc = mesh.jts[:,c], mesh.wts[:,c]
        sel = wc > 1e-6
        if not sel.any(): continue
        out[sel] += np.einsum('nij,nj->ni', SM[jc[sel]], P[sel]) * wc[sel,None]
        outn[sel] += np.einsum('nij,nj->ni', SM[jc[sel]][:, :3,:3], mesh.nrm[sel]) * wc[sel,None]
    return out[:,:3], outn

wu = M(); wu.name='walk_upper'; wu.pos, wu.nrm = skin(upper); wu.idx = upper.idx; wu.jts=None
wl = M(); wl.name='walk_lower'; wl.pos, wl.nrm = skin(lower); wl.idx = lower.idx; wl.jts=None

# ---- identify spike verts (walk pose, non-rigid foot verts) ----
import numpy.linalg as la
selF = lower.pos[:,1] < 0.22
spike = np.zeros(len(lower.pos), bool)
for m in [selF & (lower.pos[:,0]>-0.05), selF & (lower.pos[:,0]<=-0.05)]:
    A = lower.pos[m]; B = wl.pos[m]
    ca, cb = A.mean(0), B.mean(0)
    H = (A-ca).T @ (B-cb); U,S,Vt = la.svd(H)
    d = np.sign(la.det(Vt.T@U.T)); R = Vt.T @ np.diag([1,1,d]) @ U.T
    dev = np.linalg.norm((R@(A-ca).T).T + cb - B, axis=1)
    bad = np.where(m)[0][dev > 0.05]
    spike[bad] = True
print('spike verts (dev>5cm):', spike.sum())
tri_spike = spike[wl.idx].any(axis=1)
print('triangles touching spikes:', tri_spike.sum(), 'of', len(wl.idx))

# ---- flank fragments (left-rear hip confetti) ----
frag = (lower.pos[:,0]>0.16)&(lower.pos[:,1]>0.25)&(lower.pos[:,1]<1.06)
tri_frag = frag[lower.idx].any(axis=1)
print('frag verts:', frag.sum(), 'tris touching:', tri_frag.sum())

# ---- renderer (same as verify_f28_render) ----
def render(out, meshes, eye, target, up, fov_y_deg, W=820, H=940):
    eye = np.array(eye,float); target = np.array(target,float); up = np.array(up,float)
    fwd = target-eye; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd,up); right /= np.linalg.norm(right)
    upv = np.cross(right,fwd)
    f = (H/2)/np.tan(np.radians(fov_y_deg)/2)
    img = np.zeros((H,W,3)); zbuf = np.full((H,W),1e30)
    bg_top = np.array([64,74,88]); bg_bot = np.array([46,54,66])
    for y in range(H): img[y] = bg_top + (bg_bot-bg_top)*y/H
    for gr in range(-4,5):
        for a,b in [((gr,0,-4),(gr,0,4)), ((-4,0,gr),(4,0,gr))]:
            pts=[]
            for P in (a,b):
                P = np.array(P,float); d = P-eye
                x = d@right; y = d@upv; z = d@fwd
                if z <= 0.01: pts=None; break
                pts.append((W/2+f*x/z, H/2-f*y/z, z))
            if pts:
                (x0,y0,z0),(x1,y1,z1) = pts
                n = int(max(abs(x1-x0),abs(y1-y0)))+1
                for k in range(n+1):
                    x = x0+(x1-x0)*k/n; y = y0+(y1-y0)*k/n
                    z = z0+(z1-z0)*k/n
                    xi,yi = int(round(x)),int(round(y))
                    if 0<=xi<W and 0<=yi<H and z<zbuf[yi,xi]:
                        zbuf[yi,xi]=z; img[yi,xi]=np.array([84,96,108])
    L1 = np.array([0.4,0.8,0.45]); L1/=np.linalg.norm(L1)
    L2 = np.array([-0.5,0.3,-0.6]); L2/=np.linalg.norm(L2)
    for m in meshes:
        P=m.pos; N=m.nrm
        V = P-eye; z = V@fwd; x = V@right; y = V@upv
        ok = z>0.05
        sx = W/2+f*x/z; sy = H/2-f*y/z
        for t in m.idx:
            if not (ok[t[0]] and ok[t[1]] and ok[t[2]]): continue
            xs=sx[t]; ys=sy[t]; zs=z[t]
            if xs.max()<0 or xs.min()>=W or ys.max()<0 or ys.min()>=H: continue
            n = N[t[0]]
            lam = max(0.0,n@L1)*0.62+max(0.0,n@L2)*0.25+0.18
            base = np.array([150,152,158]) if 'upper' in m.name else np.array([158,150,140])
            col = np.clip(base*lam,0,255)
            x0,x1=int(max(0,np.floor(xs.min()))),int(min(W-1,np.ceil(xs.max())))
            y0,y1=int(max(0,np.floor(ys.min()))),int(min(H-1,np.ceil(ys.max())))
            if x1<x0 or y1<y0: continue
            ax,ay=xs[0],ys[0]; bx,by=xs[1],ys[1]; cx,cy=xs[2],ys[2]
            d=(by-ay)*(cx-ax)-(bx-ax)*(cy-ay)
            if abs(d)<1e-9: continue
            for yy in range(y0,y1+1):
                for xx in range(x0,x1+1):
                    w1=((yy-ay)*(cx-ax)-(xx-ax)*(cy-ay))/d
                    w2=((xx-ax)*(by-ay)-(yy-ay)*(bx-ax))/d
                    w0=1-w1-w2
                    if w0<-1e-6 or w1<-1e-6 or w2<-1e-6: continue
                    zz=w0*zs[0]+w1*zs[1]+w2*zs[2]
                    if zz<zbuf[yy,xx]:
                        zbuf[yy,xx]=zz; img[yy,xx]=col
    Image.fromarray(img.astype(np.uint8)).save(out)
    return np.array(Image.open(out).convert('RGB'))

import os
os.makedirs(OUT, exist_ok=True)

# bind-pose front + right-side waist
bind = [upper, lower]
front = render(f'{OUT}/my_front.png', bind, eye=(0,1.0,4.2), target=(0,1.0,0), up=(0,1,0), fov_y_deg=32)
right_side = render(f'{OUT}/my_right_waist.png', bind, eye=(-2.6,1.02,0.75), target=(-0.05,1.0,0.0), up=(0,1,0), fov_y_deg=34)
right_close = render(f'{OUT}/my_right_close.png', bind, eye=(-1.35,1.02,0.35), target=(-0.18,0.98,0.10), up=(0,1,0), fov_y_deg=26)

# walk pose: full + variant WITHOUT spike tris + variant WITHOUT frag tris
walkm = [wu, wl]
w1 = render(f'{OUT}/my_walk_left.png', walkm, eye=(3.0,0.65,0.9), target=(0,0.55,0.05), up=(0,1,0), fov_y_deg=36)
w2 = render(f'{OUT}/my_walk_feet.png', walkm, eye=(-1.1,0.35,1.6), target=(-0.05,0.10,0.05), up=(0,1,0), fov_y_deg=34)

wl2 = M(); wl2.name='walk_lower'; wl2.pos, wl2.nrm = wl.pos, wl.nrm; wl2.idx = wl.idx[~tri_spike]; wl2.jts=None
render(f'{OUT}/my_walk_left_nospike.png', [wu, wl2], eye=(3.0,0.65,0.9), target=(0,0.55,0.05), up=(0,1,0), fov_y_deg=36)
render(f'{OUT}/my_walk_feet_nospike.png', [wu, wl2], eye=(-1.1,0.35,1.6), target=(-0.05,0.10,0.05), up=(0,1,0), fov_y_deg=34)

low_nofrag = M(); low_nofrag.name='knight_lower'; low_nofrag.pos, low_nofrag.nrm = lower.pos, lower.nrm; low_nofrag.idx = lower.idx[~tri_frag]; low_nofrag.jts=None
render(f'{OUT}/my_walk_left_nofrag.png', [wu, wl2], eye=(3.0,0.65,0.9), target=(0,0.55,0.05), up=(0,1,0), fov_y_deg=36)

# ---- belt hole scan on right-side views ----
print('\n--- belt scan (right-side waist view) ---')
def scan_belt(img, label):
    H,W,_ = img.shape
    # background sample: corners
    bg = img[0:40, 0:40].reshape(-1,3).mean(0)
    hits = []
    for row in range(H):
        line = img[row].astype(int)
        dist_bg = np.abs(line - bg).sum(1)
        body = dist_bg > 60   # not background-ish (also excludes grid [84,96,108]? grid vs bg: |84-64|+|96-74|+|108-88|=20+22+20=62 -> just above 60, ok-ish)
        xs = np.where(body)[0]
        if len(xs) < 3: continue
        # gaps inside [first,last]
        seg = line[xs.min():xs.max()+1]
        segbody = body[xs.min():xs.max()+1]
        # count bg runs of length>=4 inside
        runs = 0; run = 0
        for v in segbody:
            if not v: run += 1
            else:
                if run >= 4: runs += 1
                run = 0
        if run >= 4: runs += 1
        if runs: hits.append((row, runs))
    return hits
for lbl, f in [('right_waist','my_right_waist.png'), ('right_close','my_right_close.png')]:
    im = np.array(Image.open(f'{OUT}/{f}').convert('RGB'))
    hits = scan_belt(im, lbl)
    print(f'{lbl}: rows with internal bg gaps (>=4px): {len(hits)}')
    if hits:
        print('   sample rows:', hits[:20])

# spike visibility: diff walk vs walk_nospike
for lbl, a, b in [('walk_left','my_walk_left.png','my_walk_left_nospike.png'),
                  ('walk_feet','my_walk_feet.png','my_walk_feet_nospike.png')]:
    A = np.array(Image.open(f'{OUT}/{a}').convert('RGB')).astype(int)
    B = np.array(Image.open(f'{OUT}/{b}').convert('RGB')).astype(int)
    d = np.abs(A-B).sum(2)
    ys,xs = np.where(d>30)
    if len(xs):
        print(f'SPIKE VISIBILITY {lbl}: {len(xs)} px, bbox x[{xs.min()},{xs.max()}] y[{ys.min()},{ys.max()}]')
        # save crop around it
        pad=60
        x0,x1=max(0,xs.min()-pad),min(820,xs.max()+pad); y0,y1=max(0,ys.min()-pad),min(940,ys.max()+pad)
        Image.fromarray(A[y0:y1,x0:x1].astype(np.uint8)).resize(((x1-x0)*2,(y1-y0)*2), Image.LANCZOS).save(f'{OUT}/spikevis_{lbl}.png')
        Image.fromarray(A.astype(np.uint8)).save(f'{OUT}/{a}')  # keep
    else:
        print(f'SPIKE VISIBILITY {lbl}: not visible in this camera')

# frag visibility
A = np.array(Image.open(f'{OUT}/my_walk_left.png').convert('RGB')).astype(int)
B = np.array(Image.open(f'{OUT}/my_walk_left_nofrag.png').convert('RGB')).astype(int)
d = np.abs(A-B).sum(2); ys,xs = np.where(d>30)
print(f'FRAG VISIBILITY walk_left: {len(xs)} px', f'bbox x[{xs.min()},{xs.max()}] y[{ys.min()},{ys.max()}]' if len(xs) else '')
print('done')
