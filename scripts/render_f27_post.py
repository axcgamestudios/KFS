#!/usr/bin/env python3
"""F27 — verification renders (post right-hand surgery): full body + both
wrists tight, bind pose, using the proven flood_f27_v2 renderer pattern."""
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

def render(out, mesh, eye, target, up, fov_y_deg, IMG_W=520, IMG_H=560):
    eye = np.array(eye,float); target = np.array(target,float); up = np.array(up,float)
    fwd = target-eye
    n = np.linalg.norm(fwd)
    if n < 1e-6: fwd = np.array([0,0,1.0])
    else: fwd = fwd/n
    rgt = np.cross(fwd,up)
    if np.linalg.norm(rgt) < 1e-6: rgt = np.array([1.0,0,0])
    else: rgt = rgt/np.linalg.norm(rgt)
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
    return (img > 8).any()

OUT = '/home/z/my-project/scripts/shots_f27'
SRC = '/home/z/my-project/public/game/models/knight_rigged.glb'
g, buf = load(SRC)

body = {'pos': None, 'nrm': None, 'idx': None}
parts = []
for m in g['meshes']:
    if m.get('name') in ('knight_sword','knight_shield'): continue
    p = m['primitives'][0]
    parts.append({'pos': readacc(g, buf, p['attributes']['POSITION']),
                  'nrm': readacc(g, buf, p['attributes']['NORMAL']),
                  'idx': readacc(g, buf, p['indices']).astype(np.int64).reshape(-1,3),
                  'name': m.get('name')})

# merge into one mesh
def merged(meshes):
    P = np.concatenate([x['pos'] for x in meshes])
    N = np.concatenate([x['nrm'] for x in meshes])
    off = 0; T = []
    for x in meshes:
        T.append(x['idx'] + off); off += len(x['pos'])
    return {'pos': P, 'nrm': N, 'idx': np.concatenate(T)}

whole = merged(parts)
upper = [x for x in parts if x['name']=='knight_upper'][0]

# joints (for reference)
jn = [g['nodes'][j]['name'] for j in g['skins'][0]['joints']]
jidx = {n: i for i, n in enumerate(jn)}
par = {}
for i, n in enumerate(g['nodes']):
    for ch in n.get('children', []): par[ch] = i
def world(name):
    j = g['skins'][0]['joints'][jidx[name]]
    chain=[]; i=j
    while i is not None: chain.append(i); i=par.get(i)
    p=np.zeros(3)
    for c in chain[::-1]: p+=np.array(g['nodes'][c].get('translation',[0,0,0]),float)
    return p
wR, wL = world('j_wristR'), world('j_wristL')
print('wristR', np.round(wR,3), 'wristL', np.round(wL,3))

ok1 = render(f'{OUT}/post_front.png', whole, [0, 1.0, 4.6], [0, 0.9, 0], [0,1,0], 40)
ok2 = render(f'{OUT}/post_right_wrist.png', whole,
             wR + np.array([-0.85, 0.02, 0.75]), wR + np.array([0.02,-0.06,0.0]), [0,1,0], 42)
ok3 = render(f'{OUT}/post_left_wrist.png', whole,
             wL + np.array([0.85, 0.02, 0.75]), wL + np.array([-0.02,-0.06,0.0]), [0,1,0], 42)
ok4 = render(f'{OUT}/post_right_wrist_inner.png', whole,
             wR + np.array([0.35, 0.05, 0.85]), wR + np.array([0,-0.06,0.0]), [0,1,0], 42)
ok5 = render(f'{OUT}/post_left_wrist_inner.png', whole,
             wL + np.array([-0.35, 0.05, 0.85]), wL + np.array([0,-0.06,0.0]), [0,1,0], 42)
print('nonblack:', ok1, ok2, ok3, ok4, ok5)
