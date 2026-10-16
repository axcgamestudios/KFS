#!/usr/bin/env python3
"""F28 v3 — FINAL SURGERY: 
A. knight_lower: kill CONNECTED COMPONENTS that are >=90% inside the floating
   flank zone (x>0.16, y in [0.25,1.06]) — the shield rim slab islands.
   Plus the 16 j_wristR verts with bind y<0.25 (sword tip fragment).
B. knight_upper: kill components >=90% inside (x>0.14, y in [0.84,1.02]) that
   are root/torso-skinned (the slab's upper part below the left hand).
   The arm chain (elbowL/wristL verts) and the belt mass survive (they're
   welded to bigger components or outside the zone).
C. Re-skin: verts with bind y<0.23 dominated by kneeL/kneeR -> 100% ankleL/ankleR.
D. Rebuild GLB (images preserved)."""
import json, struct, shutil
import numpy as np
from collections import Counter

SRC = '/home/z/my-project/public/game/models/knight_rigged.glb'
BAK = '/home/z/my-project/scripts/knight_rigged.glb.bak'  # PRE-v2 original

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

def pack(arr, ct):
    if ct == 5126: return np.asarray(arr, dtype='<f4').tobytes()
    if ct == 5125: return np.asarray(arr, dtype='<u4').tobytes()
    if ct == 5123: return np.asarray(arr, dtype='<u2').tobytes()
    if ct == 5121: return np.asarray(arr, dtype='<u1').tobytes()
    raise ValueError(ct)

gltf, buf = load(SRC)
jn = [gltf['nodes'][j]['name'] for j in gltf['skins'][0]['joints']]

# ---------------- union-find components per mesh ----------------
def components(idx, nverts):
    nt = len(idx)
    parent = np.arange(nverts, dtype=np.int64)
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    i = idx.reshape(-1)
    for c in range(2):
        e = np.stack([i[c::3] if False else idx[:, c], idx[:, (c+1) % 3]], axis=1)
        e.sort(axis=1)
        o = np.lexsort((e[:, 1], e[:, 0]))
        es = e[o]
        ng = np.ones(len(es), dtype=bool)
        ng[1:] = (es[1:] != es[:-1]).any(axis=1)
        eid = np.cumsum(ng) - 1
        edge_ids = np.empty(len(es), dtype=np.int64)
        edge_ids[o] = eid
        tri_of_edge = np.repeat(np.arange(nt), 3)
        o2 = np.argsort(edge_ids, kind='stable')
        ei = edge_ids[o2]; tt = tri_of_edge[o2]
        same = ei[1:] == ei[:-1]
        for k in np.nonzero(same)[0]:
            ra, rb = find(tt[k]), find(tt[k+1])
            if ra != rb: parent[ra] = rb
    # per-vertex root
    roots = np.array([find(v) for v in range(nverts)])
    return roots

ACC_OF = {}
EDIT_WEIGHTS = {}   # mesh idx -> (jts_arr, wts_arr) modified

for mi, mesh in enumerate(gltf['meshes']):
    name = mesh.get('name', '')
    if name not in ('knight_lower', 'knight_upper'):
        continue
    p = mesh['primitives'][0]
    pos = read_raw(gltf, buf, p['attributes']['POSITION'])
    jts = read_raw(gltf, buf, p['attributes']['JOINTS_0']).astype(int)
    wts = read_raw(gltf, buf, p['attributes']['WEIGHTS_0'])
    idx = read_raw(gltf, buf, p['indices']).astype(np.int64).reshape(-1, 3)
    dom = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])
    n = len(pos)

    if name == 'knight_lower':
        # A1: component-based flank kill
        roots = components(idx, n)
        used = np.unique(idx)   # referenced verts only
        kill = np.zeros(n, dtype=bool)
        flank_zone = (pos[:,0] > 0.16) & (pos[:,1] > 0.25) & (pos[:,1] < 1.06)
        killed_comps = 0
        for r in np.unique(roots[used]):
            members = np.nonzero(roots == r)[0]
            inzone = flank_zone[members]
            if len(members) >= 1 and inzone.mean() >= 0.9 and len(members) <= 400:
                kill[members] = True
                killed_comps += 1
        n1 = kill.sum()
        # A2: sword tip verts (wristR-skinned, y<0.25)
        kill |= (dom == 'j_wristR') & (pos[:,1] < 0.25)
        print(f'knight_lower: flank comps killed: {killed_comps} ({n1} verts) + sword tip {(kill.sum()-n1)} = {kill.sum()}')
        # C: re-weight boot verts from knee to ankle
        remap_knee = {'j_kneeL': 'j_ankleL', 'j_kneeR': 'j_ankleR'}
        nfixed = 0
        for vs in range(n):
            if pos[vs, 1] < 0.23 and dom[vs] in remap_knee:
                tgt = jn.index(remap_knee[dom[vs]])
                jts[vs] = [tgt, tgt, tgt, tgt]
                wts[vs] = [1.0, 0.0, 0.0, 0.0]
                nfixed += 1
        print(f'  re-weighted {nfixed} boot verts knee->ankle')
        EDIT_WEIGHTS[mi] = (jts, wts)
    else:
        # B: upper slab part: components >=90% in (x>0.14, y in [0.84,1.02]) & root/torso-skinned
        roots = components(idx, n)
        used = np.unique(idx)
        kill = np.zeros(n, dtype=bool)
        zone = (pos[:,0] > 0.14) & (pos[:,1] > 0.84) & (pos[:,1] < 1.02)
        armish = (dom == 'j_elbowL') | (dom == 'j_wristL') | (dom == 'j_shoulderL')
        killed_comps = 0
        for r in np.unique(roots[used]):
            members = np.nonzero(roots == r)[0]
            inzone = zone[members]
            if len(members) >= 1 and inzone.mean() >= 0.9 and len(members) <= 400 and not armish[members].any():
                kill[members] = True
                killed_comps += 1
        print(f'knight_upper: comps killed: {killed_comps} ({kill.sum()} verts)')

    if not kill.any():
        continue
    # rebuild mesh
    nrm = read_raw(gltf, buf, p['attributes']['NORMAL']) if 'NORMAL' in p['attributes'] else None
    uv = read_raw(gltf, buf, p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else None
    tri_kill = kill[idx].any(axis=1)
    keep_tris = idx[~tri_kill]
    used2, remap = np.unique(keep_tris.reshape(-1), return_inverse=True)
    new_idx = remap.reshape(-1, 3)
    # if weights were edited for this mesh, slice them too
    if mi in EDIT_WEIGHTS:
        jts2, wts2 = EDIT_WEIGHTS[mi]
        ACC_OF[p['attributes']['JOINTS_0']] = jts2[used2]
        ACC_OF[p['attributes']['WEIGHTS_0']] = wts2[used2]
        EDIT_WEIGHTS[mi] = (jts2[used2], wts2[used2])
    subs = {'POSITION': pos[used2], 'NORMAL': nrm[used2] if nrm is not None else None,
            'TEXCOORD_0': uv[used2] if uv is not None else None}
    for attr, arr in subs.items():
        if attr in p['attributes'] and arr is not None:
            ACC_OF[p['attributes'][attr]] = arr
    if mi not in EDIT_WEIGHTS:
        ACC_OF[p['attributes']['JOINTS_0']] = read_raw(gltf, buf, p['attributes']['JOINTS_0'])[used2]
        ACC_OF[p['attributes']['WEIGHTS_0']] = read_raw(gltf, buf, p['attributes']['WEIGHTS_0'])[used2]
    ACC_OF[p['indices']] = new_idx
    print(f'  {name}: -{int(tri_kill.sum())} tris -> {len(used2)} verts')

# ---------------- assemble new GLB ----------------
new_bin = bytearray()
new_views = []
img_view_map = {}
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
        if 'max' in acc:
            a2 = np.asarray(arr)
            if TYPES[acc['type']] >= 2 and acc['type'] != 'SCALAR':
                acc['max'] = a2.max(axis=0).tolist(); acc['min'] = a2.min(axis=0).tolist()
            else:
                acc['max'] = [float(a2.max())]; acc['min'] = [float(a2.min())]
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
print(f'\nwrote {SRC}: {total} bytes')

# ---------------- audit ----------------
g2, b2 = load(SRC)
for mi, mesh in enumerate(g2['meshes']):
    p = mesh['primitives'][0]
    pos = read_raw(g2, b2, p['attributes']['POSITION'])
    idx = read_raw(g2, b2, p['indices']).astype(np.int64).reshape(-1, 3)
    tp = pos[idx]
    used = np.unique(idx)
    line = f"{mesh['name']}: {len(pos)} verts {len(idx)} tris orphans {len(pos)-len(used)}"
    if mesh['name'] == 'knight_lower':
        footL = ((tp[:,:,1]<0.22)&(tp[:,:,0]>-0.05)).all(axis=1)
        footR = ((tp[:,:,1]<0.22)&(tp[:,:,0]<=-0.05)).all(axis=1)
        flank = (tp[:,:,0]>0.19).all(axis=1) & (tp[:,:,1]>0.25).all(axis=1) & (tp[:,:,1]<1.06).all(axis=1)
        jts = read_raw(g2, b2, p['attributes']['JOINTS_0']).astype(int)
        wts = read_raw(g2, b2, p['attributes']['WEIGHTS_0'])
        dom2 = np.array([jn[jts[i, np.argmax(wts[i])]] for i in range(len(pos))])
        kneeboot = ((dom2=='j_kneeL')|(dom2=='j_kneeR')) & (pos[:,1]<0.22)
        line += f" | footL {int(footL.sum())} footR {int(footR.sum())} flankTris {int(flank.sum())} kneeBootVerts {int(kneeboot.sum())}"
    print(line)
