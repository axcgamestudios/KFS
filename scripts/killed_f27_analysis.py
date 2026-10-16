#!/usr/bin/env python3
"""F27 — WHERE did the F28 surgery delete verts? Compare .bak vs current
bind-space positions per mesh; classify killed verts by body region."""
import json, struct
import numpy as np

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
    out = np.empty((n, comp))
    for k in range(n):
        po = off+k*st
        if comp==3: out[k]=struct.unpack_from('<3f',buf,po)
        elif comp==4 and acc['componentType']==5126: out[k]=struct.unpack_from('<4f',buf,po)
        elif comp==4 and acc['componentType']==5121: out[k]=struct.unpack_from('<4B',buf,po)
        elif comp==2: out[k]=struct.unpack_from('<2f',buf,po)
        else: out[k]=struct.unpack_from('<f',buf,po)
    return out

gb, bb = load('/home/z/my-project/scripts/knight_rigged.glb.bak')
gc, bc = load('/home/z/my-project/public/game/models/knight_rigged.glb')

def mesh_pos(g, buf, name):
    for m in g['meshes']:
        if m.get('name') == name:
            p = m['primitives'][0]
            return rr(g, buf, p['attributes']['POSITION'])
    return None

for name in ['knight_upper', 'knight_lower']:
    A = mesh_pos(gb, bb, name); B = mesh_pos(gc, bc, name)
    print(f'== {name}: bak={len(A)} cur={len(B)} killed={len(A)-len(B)}')
    # match current verts into bak by exact position (quantized)
    key = lambda P: set(map(tuple, np.round(P, 5)))
    ka, kc = key(A), key(B)
    missing = np.array([v for v in ka if v not in kc])
    if len(missing) == 0: continue
    x, y, z = missing[:,0], missing[:,1], missing[:,2]
    print(f'   killed verts bbox: x[{x.min():.2f},{x.max():.2f}] y[{y.min():.2f},{y.max():.2f}] z[{z.min():.2f},{z.max():.2f}]')
    # region histogram
    regions = {
      'RIGHT hand (x<-0.30, y 0.85-1.20)': (x < -0.30) & (y > 0.85) & (y < 1.20),
      'LEFT hand (x>0.30, y 0.85-1.20)': (x > 0.30) & (y > 0.85) & (y < 1.20),
      'left flank slab (x>0.16, y 0.25-1.06)': (x > 0.16) & (y > 0.25) & (y < 1.06),
      'right flank (x<-0.16, y 0.25-1.06)': (x < -0.16) & (y > 0.25) & (y < 1.06),
      'feet (y<-0.88)': (y < -0.88),
      'legs (y -0.88..0.25)': (y >= -0.88) & (y < 0.25),
      'torso (y 0.25..1.35)': (y >= 0.25) & (y < 1.35) & (np.abs(x) <= 0.16),
      'head (y>1.35)': (y > 1.35),
    }
    for rname, sel in regions.items():
        if sel.sum(): 
            print(f'   {rname}: {sel.sum()}')
    # right-hand detail: what does the RIGHT side look like now vs bak
    for side, sgn in [('RIGHT', -1), ('LEFT', +1)]:
        handA = A[(sgn*A[:,0] > 0.30) & (A[:,1] > 0.85) & (A[:,1] < 1.25)]
        handB = B[(sgn*B[:,0] > 0.30) & (B[:,1] > 0.85) & (B[:,1] < 1.25)]
        foreA = A[(sgn*A[:,0] > 0.30) & (A[:,1] > 1.25) & (A[:,1] < 1.45)]
        foreB = B[(sgn*B[:,0] > 0.30) & (B[:,1] > 1.25) & (B[:,1] < 1.45)]
        print(f'   {side}: hand-zone bak={len(handA)} cur={len(handB)} | forearm-zone bak={len(foreA)} cur={len(foreB)}')
