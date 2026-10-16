#!/usr/bin/env python3
"""F28 v5 — map the GHOST HILT (baked pommel/grip/crossguard) at the right hand
in knight_upper. The hand (fist) is wristR/elbowR-skinned around y 0.94-1.13,
x -0.335..-0.158, z 0.045..-0.245. The sword column axis: the planted sword
runs from the ground (y~0) up to the pommel (y~1.05) around x -0.25, z 0.15-0.20.
The vec_sword extraction box stopped at y 0.936 — everything above = ghost hilt."""
import json, struct
import numpy as np
from collections import Counter

def load(path):
    with open(path, 'rb') as f: data = f.read()
    jl, _ = struct.unpack_from('<II', data, 12)
    g = json.loads(data[20:20+jl].decode())
    bo = 20 + jl
    while bo % 4: bo += 1
    bl, _ = struct.unpack_from('<II', data, bo)
    return g, data[bo+8:bo+8+bl]

TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def rr(g, buf, ai):
    acc = g['accessors'][ai]; bv = g['bufferViews'][acc['bufferView']]
    comp = TYPES[acc['type']]
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[acc['componentType']]
    n, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    st = bv.get('byteStride',0) or struct.calcsize('<'+fmt)*comp
    out = np.empty((n, comp))
    for k in range(n):
        po = off+k*st
        if comp==3 and acc['componentType']==5126: out[k]=struct.unpack_from('<3f',buf,po)
        elif comp==1 and acc['componentType']==5125: out[k]=struct.unpack_from('<I',buf,po)[0]
        elif comp==4 and acc['componentType']==5126: out[k]=struct.unpack_from('<4f',buf,po)
        elif comp==4 and acc['componentType']==5121: out[k]=struct.unpack_from('<4B',buf,po)
        elif comp==2: out[k]=struct.unpack_from('<2f',buf,po)
        else: out[k]=struct.unpack_from('<'+fmt*comp,buf,po)
    return out

g, buf = load('/home/z/my-project/public/game/models/knight_rigged.glb')
jn = [g['nodes'][j]['name'] for j in g['skins'][0]['joints']]
p = g['meshes'][0]['primitives'][0]   # knight_upper
pos = rr(g, buf, p['attributes']['POSITION'])
jts = rr(g, buf, p['attributes']['JOINTS_0']).astype(int)
wts = rr(g, buf, p['attributes']['WEIGHTS_0'])
dom = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])

# the sword axis reference: from the sword PROP (mesh 2) — its geometry is in
# wristR-local coords; world = prop + wristR(-0.232, 1.04, 0.193)... wait,
# wristR world: root(-0.028,0.836,0) + torso(0,0.26,0) + shoulderR(-0.251,0.446,0)
# + elbowR(-0.074,-0.241,0.093) + wristR(0.102,-0.26,0.084)
wr = np.array([-0.028+0-0.251-0.074+0.102, 0.836+0.26+0.446-0.241-0.26, 0+0+0+0.093+0.084])
sp = g['meshes'][2]['primitives'][0]
spos = rr(g, buf, sp['attributes']['POSITION']) + wr
sword_top = spos[spos[:,1].argsort()[-200:]]
print('sword prop top (pommel) world:', np.round(sword_top.mean(axis=0), 3))
print('sword prop bbox world: X[%.3f,%.3f] Y[%.3f,%.3f] Z[%.3f,%.3f]' % (
    spos[:,0].min(), spos[:,0].max(), spos[:,1].min(), spos[:,1].max(), spos[:,2].min(), spos[:,2].max()))

# ghost hilt zone in UPPER: right-hand column, above the extraction box top (y 0.936)
zone = (pos[:,0] > -0.36) & (pos[:,0] < -0.13) & (pos[:,1] > 0.90) & (pos[:,2] > 0.05) & (pos[:,2] < 0.28)
z = zone & (pos[:,1] > 0.936)
pp = pos[z]
print(f'\nUPPER right-hand zone above y=0.936: {z.sum()} verts')
print(f'  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')
print('  bones:', dict(Counter(dom[z])))
# y histogram
h, e = np.histogram(pp[:,1], bins=np.arange(0.93, 1.15, 0.01))
print('  y hist:', ' '.join(f'{e[i]:.2f}:{int(h[i])}' for i in range(len(h)) if h[i]>0))
# distance to sword axis: the sword column at this height — the sword prop's local axis
# Find upper verts near the sword PROP's pommel position:
pommel = sword_top.mean(axis=0)
dist = np.linalg.norm(pos - pommel, axis=1)
near = (dist < 0.09) & (pos[:,1] > 0.90)
print(f'\nverts within 9cm of pommel center {np.round(pommel,3)}: {near.sum()}')
print('  bones:', dict(Counter(dom[near])))
ppn = pos[near]
print(f'  Y[{ppn[:,1].min():+.3f},{ppn[:,1].max():+.3f}] Z[{ppn[:,2].min():+.3f},{ppn[:,2].max():+.3f}]')
# crossguard: horizontal bar near y ~0.97-1.0? histogram of z for the zone verts by y band
for y0 in [0.936, 0.96, 0.98, 1.00, 1.02, 1.04, 1.06, 1.08]:
    m = zone & (pos[:,1] >= y0) & (pos[:,1] < y0+0.02)
    if m.sum():
        pz = pos[m]
        print(f'  y[{y0:.3f},{y0+0.02:.3f}): {m.sum():4d} verts  x[{pz[:,0].min():+.3f},{pz[:,0].max():+.3f}] z[{pz[:,2].min():+.3f},{pz[:,2].max():+.3f}] bones={dict(Counter(dom[m]))}')
