#!/usr/bin/env python3
"""F27 — render the CURRENT knight_rigged.glb (bind + walk + grip poses),
full body and hand zooms, to inspect the reported 'bug la mano'."""
import json, struct, os
import numpy as np
from PIL import Image

PATH = '/home/z/my-project/public/game/models/knight_rigged.glb'
OUT = '/home/z/my-project/scripts/shots_f27'
os.makedirs(OUT, exist_ok=True)

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
    p = m['primitives'][0]; mm = M(); mm.name = m.get('name')
    mm.pos = rr(g, buf, p['attributes']['POSITION'])
    mm.nrm = rr(g, buf, p['attributes']['NORMAL'])
    mm.idx = rr(g, buf, p['indices']).astype(np.int64).reshape(-1,3)
    if 'JOINTS_0' in p['attributes']:
        mm.jts = rr(g, buf, p['attributes']['JOINTS_0']).astype(int)
        mm.wts = rr(g, buf, p['attributes']['WEIGHTS_0'])
    else: mm.jts = None
    ms[mm.name] = mm
print('meshes:', {k: len(v.pos) for k, v in ms.items()})

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
    while i is not None: chain.append(i); i = par.get(i)
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
def rot_z(a):
    c,s=np.cos(a),np.sin(a); Mm=np.eye(4); Mm[0,0]=c;Mm[0,1]=-s;Mm[1,0]=s;Mm[1,1]=c; return Mm

jn = {n: i for i, n in enumerate(jnames)}
node_of = {jnames[k]: joint_idx[k] for k in range(len(joint_idx))}

POSES = {
  'bind': {},
  'walk': {node_of['j_hipL']: rot_x(+0.55), node_of['j_kneeL']: rot_x(+0.35),
           node_of['j_hipR']: rot_x(-0.50), node_of['j_kneeR']: rot_x(+0.25),
           node_of['j_torso']: rot_y(0.10)},
  'grip': {node_of['j_shoulderR']: rot_x(-0.9), node_of['j_elbowR']: rot_x(-0.6),
           node_of['j_shoulderL']: rot_x(-0.35), node_of['j_elbowL']: rot_x(-0.5)},
}

def skin(mesh, posedG):
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

def render(out, meshes, eye, target, up, fov_y_deg, W=560, H=680):
    eye = np.array(eye,float); target = np.array(target,float); up = np.array(up,float)
    fwd = target-eye; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd,up); right /= np.linalg.norm(right)
    upv = np.cross(right,fwd)
    f = 0.5/np.tan(np.radians(fov_y_deg)/2)
    K = np.array([[f*H/W,0,0],[0,f,0],[0,0,1]])
    zbuf = np.full((H,W), np.inf); img = np.zeros((H,W,3))
    for mesh in meshes:
        P, N = mesh.pos, mesh.nrm
        if P[:,1].size == 0: continue
        pc = (P-eye)@np.stack([right,upv,fwd]).T
        m = pc[:,2] > 0.05
        if not m.any(): continue
        idx = mesh.idx[m[mesh.idx].all(axis=1)]
        if len(idx)==0: continue
        u = (pc[:,0]/pc[:,2]*f*H/W*0.5+0.5)*W
        v = (1-(pc[:,1]/pc[:,2]*f*0.5+0.5))*H
        shade = np.clip(-(N@fwd),0,1)*0.75+0.25
        for t in idx:
            if not (m[t].all()): continue
            xs = u[t]; ys = v[t]
            x0,x1 = int(max(0,np.floor(xs.min()))), int(min(W-1,np.ceil(xs.max())))
            y0,y1 = int(max(0,np.floor(ys.min()))), int(min(H-1,np.ceil(ys.max())))
            if x1<x0 or y1<y0: continue
            ax,ay,bx,by,cx,cy = xs[0],ys[0],xs[1],ys[1],xs[2],ys[2]
            den = (by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
            if abs(den)<1e-9: continue
            w0 = np.empty(3)
            zmean = pc[t,2].mean()
            for yy in range(y0,y1+1):
                for xx in range(x0,x1+1):
                    w0[0]=((by-cy)*(xx-cx)+(cx-bx)*(yy-cy))/den
                    w0[1]=((cy-ay)*(xx-cx)+(ax-cx)*(yy-cy))/den
                    w0[2]=1-w0[0]-w0[1]
                    if w0.min()<-0.001: continue
                    if zmean < zbuf[yy,xx]:
                        zbuf[yy,xx]=zmean
                        col = shade[t].mean()
                        img[yy,xx]=[col*0.85, col*0.8, col*0.72]
    Image.fromarray((img*255).astype(np.uint8)).save(out)

# Bounding box of the whole model for camera setup
allmin = np.full(3, 1e9); allmax = np.full(3, -1e9)
for m_ in ms.values():
    allmin = np.minimum(allmin, m_.pos.min(0)); allmax = np.maximum(allmax, m_.pos.max(0))
print('bbox min', allmin, 'max', allmax)
H_MODEL = allmax[1]-allmin[1]
print('height', H_MODEL)

for pose_name, extra in POSES.items():
    posedG = {k: ng(ji, extra) for k, ji in enumerate(joint_idx)}
    posed = {}
    for name, mesh in ms.items():
        p2 = M(); p2.name = name+'_p'
        p2.pos, p2.nrm = skin(mesh, posedG)
        p2.idx = mesh.idx; p2.jts=None
        posed[name] = p2
    meshes = list(posed.values())
    # hand centroids in bind pose (y up): wrist joints ~ y 1.06 area per surgery notes
    # full body shots
    for view, eye in [
        ('front', [0, 1.0, 4.2]),
        ('left',  [4.2, 1.0, 0]),
        ('right', [-4.2, 1.0, 0]),
    ]:
        render(f'{OUT}/{pose_name}_{view}.png', meshes, eye, [0, 0.95, 0], [0,1,0], 42)
    # hand zooms: find verts near each wrist in POSED space
    lw_name = [n for n in jnames if 'wristL' in n]
    rw_name = [n for n in jnames if 'wristR' in n]
    print('wrist joints:', lw_name, rw_name)
    for side, jn_ in [('L', lw_name[0] if lw_name else None), ('R', rw_name[0] if rw_name else None)]:
        if jn_ is None: continue
        wpos = ng(node_of[jn_], extra)[:3,3]
        # gather nearby posed verts
        cands = np.zeros(3); cnt = 0
        for mesh in meshes:
            d = np.linalg.norm(mesh.pos - wpos, axis=1)
            sel = d < 0.35
            if sel.any():
                cands += mesh.pos[sel].sum(0); cnt += sel.sum()
        if cnt: cands /= cnt
        print(f'{pose_name} hand{side} centroid', cands, 'verts', cnt)
        render(f'{OUT}/{pose_name}_hand{side}.png', meshes,
               [cands[0]+0.9, cands[1]+0.15, cands[2]+1.5], [cands[0], cands[1], cands[2]], [0,1,0], 40, W=520, H=520)
print('done ->', OUT)
