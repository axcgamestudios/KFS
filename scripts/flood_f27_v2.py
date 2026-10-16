#!/usr/bin/env python3
"""F27 — flood-fill the LEFT HAND from wristL through arm-skinned triangles;
render the patch alone + in place. Clean rewrite (names chosen to avoid the
transport-mangling that hit the previous version)."""
import json, struct, os
import numpy as np
from PIL import Image

def load(path):
    with open(path, 'rb') as f: data = f.read()
    jl, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+jl].decode())
    bo = 20 + jl
    while bo % 4: bo += 1
    bl, _ = struct.unpack_from('<II', data, bo)
    return gltf, data[bo+8:bo+8+bl]

def readacc(g, buf, ai):
    acc = g['accessors'][ai]; bv = g['bufferViews'][acc['bufferView']]
    ct = acc['componentType']; typ = acc['type']
    comp = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[typ]
    n, off = acc['count'], bv.get('byteOffset',0)+acc.get('bufferOffset',0)
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[ct]
    out = np.empty((n, comp))
    for k in range(n):
        po = off+k*comp*struct.calcsize('<'+fmt)
        out[k] = struct.unpack_from('<'+fmt*comp, buf, po)
    return out

g, buf = load('/home/z/my-project/public/game/models/knight_rigged.glb')
jn = [g['nodes'][j]['name'] for j in g['skins'][0]['joints']]
jidx = {n: i for i, n in enumerate(jn)}
nodes = g['nodes']; par = {}
for i, n in enumerate(nodes):
    for ch in n.get('children', []): par[ch] = i
def world(name):
    j = g['skins'][0]['joints'][jidx[name]]
    chain=[]; i=j
    while i is not None: chain.append(i); i=par.get(i)
    p=np.zeros(3)
    for c in chain[::-1]: p+=np.array(nodes[c].get('translation',[0,0,0]),float)
    return p
wL = world('j_wristL')

m = [x for x in g['meshes'] if x.get('name')=='knight_upper'][0]
p = m['primitives'][0]
P = readacc(g, buf, p['attributes']['POSITION'])
NRM = readacc(g, buf, p['attributes']['NORMAL'])
J = readacc(g, buf, p['attributes']['JOINTS_0']).astype(int)
WT = readacc(g, buf, p['attributes']['WEIGHTS_0'])
TRIS = readacc(g, buf, p['indices']).astype(np.int64).reshape(-1,3)
dom = J[np.arange(len(P)), np.argmax(WT, axis=1)]
armjoints = [jidx['j_elbowL'], jidx['j_wristL'], jidx['j_shoulderL']]
isarm = np.isin(dom, armjoints)
dist = np.linalg.norm(P - wL, axis=1)
seeds = np.where(isarm & (dist < 0.18))[0]

arm_tris = TRIS[isarm[TRIS].all(axis=1)]
adj = {}
for t in arm_tris:
    a,b,c = int(t[0]), int(t[1]), int(t[2])
    for u,v in ((a,b),(b,c),(c,a)):
        adj.setdefault(u,set()).add(v)
        adj.setdefault(v,set()).add(u)

seen = set(int(x) for x in seeds)
frontier = list(seen)
while frontier:
    nxt = []
    for u in frontier:
        for v in adj.get(u, ()):
            if v in seen or not isarm[v]: continue
            if np.linalg.norm(P[v]-wL) > 0.55: continue
            if P[v,1] > wL[1] + 0.12: continue
            seen.add(v); nxt.append(v)
    frontier = nxt
hand = np.array(sorted(seen))
print('hand patch verts:', len(hand))
patch_tris = arm_tris[np.isin(arm_tris, hand).all(axis=1)]
print('patch triangles:', len(patch_tris))

remap = np.full(len(P), -1, dtype=np.int64)
remap[hand] = np.arange(len(hand))
local_tris = remap[patch_tris].astype(np.int64)

def render(out, mesh, eye, target, up, fov_y_deg, IMG_W=460, IMG_H=460):
    eye = np.array(eye,float); target = np.array(target,float); up = np.array(up,float)
    fwd = target-eye; fwd = fwd/np.linalg.norm(fwd)
    rgt = np.cross(fwd,up); rgt = rgt/np.linalg.norm(rgt)
    upv2 = np.cross(rgt,fwd)
    f = 0.5/np.tan(np.radians(fov_y_deg)/2)
    zbuf = np.full((IMG_H,IMG_W), np.inf); img = np.zeros((IMG_H,IMG_W,3))
    Pp, Nn = mesh['pos'], mesh['nrm']
    pc = (Pp-eye)@np.stack([rgt,upv2,fwd]).T
    depth_ok = pc[:,2] > 0.05
    tri_flags = depth_ok[mesh['idx']]
    visible = tri_flags.all(axis=1)
    u = (pc[:,0]/pc[:,2]*f*IMG_H/IMG_W*0.5+0.5)*IMG_W
    v = (1-(pc[:,1]/pc[:,2]*f*0.5+0.5))*IMG_H
    shade = np.clip(-(Nn@fwd),0,1)*0.75+0.25
    for t in mesh['idx'][visible]:
        xs=u[t]; ys=v[t]
        x0,x1=int(max(0,np.floor(xs.min()))),int(min(IMG_W-1,np.ceil(xs.max())))
        y0,y1=int(max(0,np.floor(ys.min()))),int(min(IMG_H-1,np.ceil(ys.max())))
        if x1<x0 or y1<y0: continue
        ax,ay,bx,by,cx,cy=xs[0],ys[0],xs[1],ys[1],xs[2],ys[2]
        den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(den)<1e-9: continue
        w0=np.empty(3); zmean=pc[t,2].mean()
        for yy in range(y0,y1+1):
            for xx in range(x0,x1+1):
                w0[0]=((by-cy)*(xx-cx)+(cx-bx)*(yy-cy))/den
                w0[1]=((cy-ay)*(xx-cx)+(ax-cx)*(yy-cy))/den
                w0[2]=1-w0[0]-w0[1]
                if w0.min()<-0.001: continue
                if zmean<zbuf[yy,xx]:
                    zbuf[yy,xx]=zmean
                    col=shade[t].mean()
                    img[yy,xx]=[col*0.85,col*0.8,col*0.72]
    Image.fromarray((img*255).astype(np.uint8)).save(out)

OUT='/home/z/my-project/scripts/shots_f27'
patch = {'pos': P[hand].copy(), 'nrm': NRM[hand].copy(), 'idx': local_tris}
fullu = {'pos': P.copy(), 'nrm': NRM.copy(), 'idx': TRIS}
look = wL + np.array([0.02,-0.10,0.0])
render(f'{OUT}/handpatch_alone.png', patch, look+np.array([0.55,0.05,0.75]), look, [0,1,0], 50)
render(f'{OUT}/handpatch_context.png', fullu, look+np.array([0.55,0.05,0.75]), look, [0,1,0], 50)
render(f'{OUT}/handpatch_alone_front.png', patch, look+np.array([0.1,0.02,1.1]), look, [0,1,0], 50)
print('rendered')
