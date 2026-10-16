#!/usr/bin/env python3
"""F27 — tight wrist closeups: .bak vs current, both hands, bind pose."""
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

TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def rr(g, buf, ai):
    acc = g['accessors'][ai]; bv = g['bufferViews'][acc['bufferView']]
    comp = TYPES[acc['type']]
    n, off = acc['count'], bv.get('byteOffset',0)+acc.get('bufferOffset',0)
    st = bv.get('byteStride',0)
    out = np.empty((n, comp), dtype=np.float64)
    for k in range(n):
        po = off+k*st
        if comp == 3: out[k] = struct.unpack_from('<3f', buf, po)
        elif comp == 4:
            if acc['componentType'] == 5121: out[k] = struct.unpack_from('<4B', buf, po)
            else: out[k] = struct.unpack_from('<4f', buf, po)
        elif comp == 2: out[k] = struct.unpack_from('<2f', buf, po)
        elif comp == 1: out[k] = struct.unpack_from('<I' if acc['componentType']==5125 else '<f', buf, po)[0]
        elif comp == 16: out[k] = struct.unpack_from('<16f', buf, po)
    return out

def render(out, meshes, eye, target, up, fov_y_deg, W=460, H=460):
    eye = np.array(eye,float); target = np.array(target,float); up = np.array(up,float)
    fwd = target-eye; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd,up); right /= np.linalg.norm(right)
    upv = np.cross(right,fwd)
    f = 0.5/np.tan(np.radians(fov_y_deg)/2)
    zbuf = np.full((H,W), np.inf); img = np.zeros((H,W,3))
    for mesh in meshes:
        P, N = mesh['pos'], mesh['nrm']
        pc = (P-eye)@np.stack([right,upv,fwd]).T
        m = pc[:,2] > 0.05
        if not m.any(): continue
        idx = mesh['idx'][m[mesh['idx']].all(axis=1)]
        if len(idx)==0: continue
        u = (pc[:,0]/pc[:,2]*f*H/W*0.5+0.5)*W
        v = (1-(pc[:,1]/pc[:,2]*f*0.5+0.5))*H
        shade = np.clip(-(N@fwd),0,1)*0.75+0.25
        for t in idx:
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

OUT = '/home/z/my-project/scripts/shots_f27'
os.makedirs(OUT, exist_ok=True)
# render body meshes only (no sword/shield props) in BIND pose
for tag, path in [('bak','/home/z/my-project/scripts/knight_rigged.glb.bak'),
                  ('cur','/home/z/my-project/public/game/models/knight_rigged.glb')]:
    g, buf = load(path)
    meshes = []
    for m in g['meshes']:
        if m.get('name') in ('knight_sword','knight_shield'): continue
        p = m['primitives'][0]
        meshes.append({'name': m.get('name'),
                       'pos': rr(g, buf, p['attributes']['POSITION']),
                       'nrm': rr(g, buf, p['attributes']['NORMAL']),
                       'idx': rr(g, buf, p['indices']).astype(np.int64).reshape(-1,3)})
    # wrist world positions (identity bind)
    nodes = g['nodes']; par = {}
    for i, n in enumerate(nodes):
        for ch in n.get('children', []): par[ch] = i
    def world(node_i):
        chain=[]; i=node_i
        while i is not None: chain.append(i); i=par.get(i)
        p=np.zeros(3)
        for c in chain[::-1]: p+=np.array(nodes[c].get('translation',[0,0,0]),float)
        return p
    wristR = world([i for i,n in enumerate(nodes) if n.get('name')=='j_wristR'][0])
    wristL = world([i for i,n in enumerate(nodes) if n.get('name')=='j_wristL'][0])
    for side, wpos in [('R', wristR), ('L', wristL)]:
        # camera: outside the hand (|x| direction), slightly forward, looking at
        # a point below the wrist (where the fingers hang)
        look = wpos + np.array([0, -0.12, 0.03])
        out_x = 0.75 * (1 if side=='L' else -1)
        eye = look + np.array([out_x, 0.10, 0.55])
        render(f'{OUT}/{tag}_wrist{side}_tight.png', meshes, eye, look, [0,1,0], 45)
        print(tag, side, 'wrist', np.round(wpos,3))
print('done')
