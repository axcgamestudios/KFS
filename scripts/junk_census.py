#!/usr/bin/env python3
"""F28 v3 — dump ALL leftover junk regions precisely to build the final kill set."""
import json, struct
import numpy as np
from collections import Counter

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
def read_raw(gltf, buf, ai):
    acc = gltf['accessors'][ai]; bv = gltf['bufferViews'][acc['bufferView']]
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

gltf, buf = load('/home/z/my-project/public/game/models/knight_rigged.glb')
jn = [gltf['nodes'][j]['name'] for j in gltf['skins'][0]['joints']]

for mi, want in [(1, 'knight_lower'), (0, 'knight_upper')]:
    p = gltf['meshes'][mi]['primitives'][0]
    pos = read_raw(gltf, buf, p['attributes']['POSITION'])
    jts = read_raw(gltf, buf, p['attributes']['JOINTS_0']).astype(int)
    wts = read_raw(gltf, buf, p['attributes']['WEIGHTS_0'])
    dom = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])
    print(f"\n========== {want} ({len(pos)} verts) ==========")

    if want == 'knight_lower':
        # 1. left flank junk: x>0.185, y 0.25-1.06
        m = (pos[:,0] > 0.185) & (pos[:,1] > 0.25) & (pos[:,1] < 1.06)
        pp = pos[m]
        print(f"[1] left flank x>0.185 y[.25,1.06]: {m.sum()} verts  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]")
        print('    bones:', dict(Counter(dom[m])))
        # z distribution
        h, e = np.histogram(pp[:,2], bins=np.arange(-0.2, 0.35, 0.05))
        print('    z hist:', ' '.join(f'{e[i]:+.2f}:{int(h[i])}' for i in range(len(h)) if h[i]>0))
        # what x do legit left tassets reach? (j_hipL dominant, y 0.45-0.75)
        tl = (dom=='j_hipL') & (pos[:,1]>0.45) & (pos[:,1]<0.75)
        print(f"    legit left tasset (hipL, y .45-.75): {tl.sum()} verts, x max {pos[tl,0].max():.3f}")
        tr = (dom=='j_hipR') & (pos[:,1]>0.45) & (pos[:,1]<0.75)
        print(f"    legit right tasset (hipR, y .45-.75): {tr.sum()} verts, x min {pos[tr,0].min():.3f}")
        # 4. right hip mass: root-skinned x<-0.15, y 0.4-0.8
        m4 = (dom=='j_root') & (pos[:,0] < -0.15) & (pos[:,1] > 0.40) & (pos[:,1] < 0.85)
        pp = pos[m4]
        print(f"[4] right hip root-skinned: {m4.sum()} verts  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]")
        # 6. the 16 wristR verts at y<0.25
        m6 = (dom=='j_wristR') & (pos[:,1] < 0.25)
        print(f"[6] wristR verts y<0.25: {m6.sum()}  pos: {np.round(pos[m6],3)[:6].tolist()}")
        # 5. boot verts dominated by knee (y<0.22)
        m5 = ((dom=='j_kneeL')|(dom=='j_kneeR')) & (pos[:,1] < 0.22)
        print(f"[5] boot verts dominated by KNEE y<0.22: {m5.sum()} (L: {(m5&(dom=='j_kneeL')).sum()}, R: {(m5&(dom=='j_kneeR')).sum()})")
        pp = pos[m5]
        print(f"    y range [{pp[:,1].min():.3f},{pp[:,1].max():.3f}]")
    else:
        # 2. left-side upper chunk: x 0.10-0.40, y 0.84-1.15
        m = (pos[:,0] > 0.10) & (pos[:,0] < 0.40) & (pos[:,1] > 0.84) & (pos[:,1] < 1.15)
        pp = pos[m]
        print(f"[2] upper left chunk x[.10,.40] y[.84,1.15]: {m.sum()} verts  X[{pp[:,0].min():+.3f},{pp[:,0].max():+.3f}] Y[{pp[:,1].min():+.3f},{pp[:,1].max():+.3f}] Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]")
        print('    bones:', dict(Counter(dom[m])))
        # split by y: hand zone (y>0.97) vs below-hand
        lo = m & (pos[:,1] < 0.97)
        hi = m & (pos[:,1] >= 0.97)
        print(f"    below-hand y<0.97: {lo.sum()} (bones {dict(Counter(dom[lo]))})")
        print(f"    hand zone y>=0.97: {hi.sum()} (bones {dict(Counter(dom[hi]))})")
        # 3. right-side sword hilt remnant: x -0.36..-0.15, y 0.90-1.10
        m3 = (pos[:,0] > -0.36) & (pos[:,0] < -0.15) & (pos[:,1] > 0.90) & (pos[:,1] < 1.10)
        pp = pos[m3]
        print(f"[3] upper right hilt zone x[-.36,-.15] y[.90,1.10]: {m3.sum()} verts  Z[{pp[:,2].min():+.3f},{pp[:,2].max():+.3f}]")
        print('    bones:', dict(Counter(dom[m3])))
        # z split: the hand (z 0.05-0.25) vs hilt poking z>0.26
        fz = m3 & (pos[:,2] > 0.255)
        print(f"    of which z>0.255 (in front of hand): {fz.sum()}")
        if fz.sum(): print(f"      their y: [{pos[fz,1].min():.3f},{pos[fz,1].max():.3f}] bones: {dict(Counter(dom[fz]))}")
        # the right HAND reference: wristR verts
        hand = (dom=='j_wristR')
        print(f"    wristR verts total: {hand.sum()}  y[{pos[hand,1].min():.3f},{pos[hand,1].max():.3f}] x[{pos[hand,0].min():.3f},{pos[hand,0].max():.3f}] z[{pos[hand,2].min():.3f},{pos[hand,2].max():.3f}]")
