#!/usr/bin/env python3
"""F28 v6 — analyze the sword-axis cylinder in knight_upper to separate the
GHOST HILT (grip column + pommel + crossguard) from the HAND (fist blob)."""
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
p = g['meshes'][0]['primitives'][0]
pos = rr(g, buf, p['attributes']['POSITION'])
jts = rr(g, buf, p['attributes']['JOINTS_0']).astype(int)
wts = rr(g, buf, p['attributes']['WEIGHTS_0'])
dom = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])

# sword prop axis: sample its verts in y bands to get the axis line
wr = np.array([-0.251, 1.028, 0.177])  # wristR world (recompute below precisely)
# precise: root + torso + shoulderR + elbowR + wristR translations
wr = np.array([-0.028+0-0.251-0.074+0.102, 0.836+0.26+0.446-0.241-0.26, 0+0+0+0.093+0.084])
sp = g['meshes'][2]['primitives'][0]
spos = rr(g, buf, sp['attributes']['POSITION']) + wr
print('sword prop axis by y band (world):')
for y0 in np.arange(0.0, 1.05, 0.1):
    m = (spos[:,1] >= y0) & (spos[:,1] < y0+0.1)
    if m.sum():
        pp = spos[m]
        print(f'  y[{y0:.1f},{y0+0.1:.1f}): {m.sum():4d} verts  cx={pp[:,0].mean():+.3f} cz={pp[:,2].mean():+.3f}  x[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]')

# the sword leans: fit axis from prop verts y in [0.5, 0.93]
m = (spos[:,1] > 0.5) & (spos[:,1] < 0.93)
A = spos[m]
# line fit: x = a*y+b, z = c*y+d
yv = A[:,1]
ax, bx = np.polyfit(yv, A[:,0], 1)
az, bz = np.polyfit(yv, A[:,2], 1)
print(f'\naxis fit: x = {ax:.4f}*y + {bx:.4f}, z = {az:.4f}*y + {bz:.4f}')
def axis_xz(y): return (ax*y+bx, az*y+bz)

# upper verts near the axis, above y 0.93
print('\nUPPER verts by distance-to-axis (y 0.93-1.09):')
sel = (pos[:,1] > 0.93) & (pos[:,1] < 1.09) & (pos[:,0] > -0.36) & (pos[:,0] < -0.10) & (pos[:,2] > 0.05) & (pos[:,2] < 0.30)
P = pos[sel]
for r0, r1 in [(0.0,0.015),(0.015,0.03),(0.03,0.045),(0.045,0.06),(0.06,0.08),(0.08,0.12),(0.12,0.30)]:
    cx, cz = axis_xz(P[:,1])
    d = np.sqrt((P[:,0]-cx)**2 + (P[:,2]-cz)**2)
    m2 = (d >= r0) & (d < r1)
    if m2.sum():
        pp = P[m2]
        idxs = np.nonzero(sel)[0][m2]
        print(f'  r[{r0:.3f},{r1:.3f}): {m2.sum():4d} verts  y[{pp[:,1].min():.3f},{pp[:,1].max():.3f}] x[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}] bones={dict(Counter(dom[idxs]))}')
