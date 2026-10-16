#!/usr/bin/env python3
"""F27 — THE RIGHT HAND: mirror the statue's left-hand gauntlet onto the right
forearm (the model NEVER shipped a right hand — the arm ends in a hollow tube;
in-game the HeroSword floats at an open wrist = "bug la mano").

Method: flood-fill the left hand patch (arm-skinned verts around j_wristL),
build a forearm frame on both sides, map (outboard, down-along-forearm,
palm-forward) L->R — a true mirror (handedness flips, triangle winding
reverses) — re-skin elbowL/wristL/shoulderL -> R-side equivalents, append to
knight_upper. Rebuild GLB (images preserved)."""
import json, struct, shutil
import numpy as np
from collections import Counter

SRC = '/home/z/my-project/public/game/models/knight_rigged.glb'
BAK = '/home/z/my-project/scripts/knight_rigged.glb.f27bak'

def load(path):
    with open(path, 'rb') as f: data = f.read()
    jl, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+jl].decode())
    bo = 20 + jl
    while bo % 4: bo += 1
    bl, _ = struct.unpack_from('<II', data, bo)
    return gltf, data[bo+8:bo+8+bl]

TYPES = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def read_raw(g, buf, ai):
    acc = g['accessors'][ai]; bv = g['bufferViews'][acc['bufferView']]
    comp = TYPES[acc['type']]
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[acc['componentType']]
    n, off = acc['count'], bv.get('byteOffset',0)+acc.get('bufferOffset',0)
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

def pack(arr, ct):
    if ct == 5126: return np.asarray(arr, dtype='<f4').tobytes()
    if ct == 5125: return np.asarray(arr, dtype='<u4').tobytes()
    if ct == 5123: return np.asarray(arr, dtype='<u2').tobytes()
    if ct == 5121: return np.asarray(arr, dtype='<u1').tobytes()
    raise ValueError(ct)

shutil.copyfile(SRC, BAK)
gltf, buf = load(SRC)
nodes = gltf['nodes']
jn = [nodes[j]['name'] for j in gltf['skins'][0]['joints']]
jidx = {n: i for i, n in enumerate(jn)}
par = {}
for i, n in enumerate(nodes):
    for ch in n.get('children', []): par[ch] = i
def world(name):
    j = gltf['skins'][0]['joints'][jidx[name]]
    chain=[]; i=j
    while i is not None: chain.append(i); i=par.get(i)
    p=np.zeros(3)
    for c in chain[::-1]: p+=np.array(nodes[c].get('translation',[0,0,0]),float)
    return p

wL, eL = world('j_wristL'), world('j_elbowL')
wR, eR = world('j_wristR'), world('j_elbowR')

# ---------------- frames ----------------
def frame(wrist, elbow, outboard_sign):
    d = wrist - elbow; d = d/np.linalg.norm(d)          # along forearm, wrist->fingers
    p = np.array([0,0,1.0])                              # model faces +z (palm-forward ref)
    p = p - np.dot(p, d)*d; p = p/np.linalg.norm(p)
    o = outboard_sign * np.cross(d, p); o = o/np.linalg.norm(o)
    return o, d, p
# left: outboard points +x-ish; right: outboard points -x-ish
oL, dL, pL = frame(wL, eL, -1.0)
oR, dR, pR = frame(wR, eR, +1.0)
print('oL', np.round(oL,3), 'dL', np.round(dL,3), 'pL', np.round(pL,3))
print('oR', np.round(oR,3), 'dR', np.round(dR,3), 'pR', np.round(pR,3))
# handedness check (mirror must flip it)
hl = np.linalg.det(np.stack([oL, dL, pL]))
hr = np.linalg.det(np.stack([oR, dR, pR]))
print('det L', round(hl,3), 'det R', round(hr,3), '(must differ in sign)')

# ---------------- flood-fill the left hand ----------------
mesh = [m for m in gltf['meshes'] if m.get('name') == 'knight_upper'][0]
prim = mesh['primitives'][0]
P  = read_raw(gltf, buf, prim['attributes']['POSITION'])
NRM = read_raw(gltf, buf, prim['attributes']['NORMAL'])
UV  = read_raw(gltf, buf, prim['attributes']['TEXCOORD_0'])
JT = read_raw(gltf, buf, prim['attributes']['JOINTS_0']).astype(int)
WT = read_raw(gltf, buf, prim['attributes']['WEIGHTS_0'])
TRIS = read_raw(gltf, buf, prim['indices']).astype(np.int64).reshape(-1,3)
dom = JT[np.arange(len(P)), np.argmax(WT, axis=1)]
armjoints = [jidx['j_elbowL'], jidx['j_wristL'], jidx['j_shoulderL']]
isarm = np.isin(dom, armjoints)
dist = np.linalg.norm(P - wL, axis=1)
seeds = set(np.where(isarm & (dist < 0.18))[0].tolist())
arm_tris = TRIS[isarm[TRIS].all(axis=1)]
adj = {}
for t in arm_tris:
    a,b,c = int(t[0]), int(t[1]), int(t[2])
    for u,v in ((a,b),(b,c),(c,a)):
        adj.setdefault(u,set()).add(v); adj.setdefault(v,set()).add(u)
seen = set(seeds); frontier = list(seeds)
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
patch_tris = arm_tris[np.isin(arm_tris, hand).all(axis=1)]
print('hand patch:', len(hand), 'verts', len(patch_tris), 'tris')

# ---------------- mirror ----------------
L2R = {'j_elbowL':'j_elbowR','j_wristL':'j_wristR','j_shoulderL':'j_shoulderR',
       'j_hipL':'j_hipR','j_kneeL':'j_kneeR','j_ankleL':'j_ankleR'}
def proj(v, o, d, p):
    return np.array([np.dot(v,o), np.dot(v,d), np.dot(v,p)])
HP = P[hand]; HN = NRM[hand]; HUV = UV[hand]
newP = np.empty_like(HP); newN = np.empty_like(HN)
for i in range(len(HP)):
    lp = proj(HP[i]-wL, oL, dL, pL)
    newP[i] = wR + oR*lp[0] + dR*lp[1] + pR*lp[2]
    ln = proj(HN[i], oL, dL, pL)
    nn = oR*ln[0] + dR*ln[1] + pR*ln[2]
    newN[i] = nn/np.linalg.norm(nn)
# joints: map L-arm joints to R-arm equivalents
map_joint = np.arange(len(jn))
for lname, rname in L2R.items():
    map_joint[jidx[lname]] = jidx[rname]
HJ = JT[hand]; HW = WT[hand]
newJ = map_joint[HJ]
# joints must stay < 256 (UBYTE) — the rig has 15 joints, fine
# winding reversal (mirror flips orientation)
newT = patch_tris[:, [0,2,1]].copy()
print('new hand verts:', len(newP), 'tris:', len(newT))
print('new hand bbox min', np.round(newP.min(0),3), 'max', np.round(newP.max(0),3))

# joint usage sanity
used = Counter()
for c in range(4):
    sel = HW[:,c] > 1e-6
    for k in np.where(sel)[0]:
        used[jn[newJ[k,c]]] += HW[k,c]
print('new hand weight mass:', sorted(used.items(), key=lambda kv:-kv[1]))

# ---------------- append to knight_upper ----------------
base = len(P)
pos2 = np.concatenate([P, newP], axis=0)
nrm2 = np.concatenate([NRM, newN], axis=0)
uv2  = np.concatenate([UV, HUV], axis=0)
jt2  = np.concatenate([JT, newJ.astype(JT.dtype)], axis=0)
wt2  = np.concatenate([WT, HW], axis=0)
idx2 = np.concatenate([TRIS, newT + base], axis=0)

ACC_OF = {
    prim['attributes']['POSITION']: pos2,
    prim['attributes']['NORMAL']: nrm2,
    prim['attributes']['TEXCOORD_0']: uv2,
    prim['attributes']['JOINTS_0']: jt2,
    prim['attributes']['WEIGHTS_0']: wt2,
    prim['indices']: idx2,
}

# ---------------- assemble new GLB ----------------
new_bin = bytearray(); new_views = []; img_view_map = {}
for img in gltf.get('images', []):
    vi = img['bufferView']
    if vi in img_view_map: continue
    bv = gltf['bufferViews'][vi]
    blob = bytes(buf[bv['byteOffset']:bv['byteOffset']+bv['byteLength']])
    off = len(new_bin)
    while off % 4: new_bin.extend(b'\0'); off = len(new_bin)
    img_view_map[vi] = len(new_views)
    new_views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(blob)})
    new_bin.extend(blob)
for img in gltf.get('images', []):
    img['bufferView'] = img_view_map[img['bufferView']]

for ai, acc in enumerate(gltf['accessors']):
    if ai in ACC_OF:
        arr = ACC_OF[ai]
        if 'max' in acc and TYPES[acc['type']] >= 2:
            acc['max'] = np.asarray(arr).max(axis=0).tolist()
            acc['min'] = np.asarray(arr).min(axis=0).tolist()
    else:
        arr = read_raw(gltf, buf, ai)
    acc['count'] = arr.size if acc['type'] == 'SCALAR' else len(arr)
    data = pack(arr, acc['componentType'])
    off = len(new_bin)
    while off % 4: new_bin.extend(b'\0'); off = len(new_bin)
    acc['bufferView'] = len(new_views)
    new_views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    new_bin.extend(data)

gltf['bufferViews'] = new_views
gltf['buffers'][0]['byteLength'] = len(new_bin)
js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
pad = (4 - len(js) % 4) % 4
js += b' ' * pad
total = 12 + 8 + len(js) + 8 + len(new_bin)
with open(SRC, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(new_bin), 0x004E4942)); f.write(bytes(new_bin))
print(f'wrote {SRC}: {total} bytes')

# ---------------- audit ----------------
g2, b2 = load(SRC)
for m2 in g2['meshes']:
    p2 = m2['primitives'][0]
    pos = read_raw(g2, b2, p2['attributes']['POSITION'])
    idx = read_raw(g2, b2, p2['indices']).astype(np.int64).reshape(-1,3)
    usedv = np.unique(idx)
    line = f"{m2.get('name')}: {len(pos)} verts {len(idx)} tris orphans {len(pos)-len(usedv)}"
    print(line)
