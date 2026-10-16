#!/usr/bin/env python3
"""F28 — isolate the kill-box verts of knight_lower into a standalone mini-GLB
so we can SEE the remnant's shape, and dump the upper band x-distribution to
separate skirt (legit) from shield back-plate (kill)."""
import json, struct
import numpy as np

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data[bin_off+8:bin_off+8+bin_len]

def read_acc(gltf, buf, acc_idx, norm=False):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    comp = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[acc['type']]
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[acc['componentType']]
    count, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    stride = bv.get('byteStride', 0) or struct.calcsize('<'+fmt)*comp
    out = np.empty((count, comp))
    for k in range(count):
        po = off + k*stride
        if comp == 3: out[k] = struct.unpack_from('<3f', buf, po)
        elif comp == 4:
            if acc['componentType'] == 5121:
                raw = np.array(struct.unpack_from('<4B', buf, po), dtype=np.float32)
                out[k] = raw/255.0 if norm else raw
            else: out[k] = struct.unpack_from('<4f', buf, po)
        elif comp == 2: out[k] = struct.unpack_from('<2f', buf, po)
        elif comp == 1: out[k] = struct.unpack_from('<'+fmt, buf, po)[0]
    return out

gltf, buf = load('/home/z/my-project/public/game/models/knight_rigged.glb')
p = gltf['meshes'][1]['primitives'][0]
pos = read_acc(gltf, buf, p['attributes']['POSITION'])
nrm = read_acc(gltf, buf, p['attributes']['NORMAL'])
uv  = read_acc(gltf, buf, p['attributes']['TEXCOORD_0'])
jts = read_acc(gltf, buf, p['attributes']['JOINTS_0']).astype(int)
wts = read_acc(gltf, buf, p['attributes']['WEIGHTS_0'], norm=True)
idx = read_acc(gltf, buf, p['indices']).astype(np.int64)

# ---- detail: y[0.75,1.10) band at z>0.104 — x histogram split by z sub-band
print("=== y[0.75,1.10) z>0.104: x-histogram ===")
band = (pos[:,1] >= 0.75) & (pos[:,1] < 1.10) & (pos[:,2] > 0.104)
for z0, z1 in [(0.104,0.13),(0.13,0.17),(0.17,0.22),(0.22,0.32)]:
    m = band & (pos[:,2] >= z0) & (pos[:,2] < z1)
    if not m.sum(): continue
    h, e = np.histogram(pos[m,0], bins=np.arange(-0.05, 0.36, 0.03))
    dist = ' '.join(f"{e[i]:+.2f}:{int(h[i])}" for i in range(len(h)) if h[i] > 0)
    print(f"z[{z0:.3f},{z1:.3f}) n={m.sum():5d}  {dist}")

# ---- the FULL kill candidate: z>0.104, x>-0.02, y<1.12
kill = (pos[:,2] > 0.104) & (pos[:,0] > -0.02) & (pos[:,1] < 1.12)
print(f"\nkill candidate verts: {kill.sum()}")

# ---- export TWO mini GLBs: (a) the kill verts as points-only mesh,
#      (b) the remaining body at y<0.3 front-left (to see what stays)
def write_miniglb(path, pts):
    # triangle soup from consecutive points is pointless; emit GL_POINTS via
    # a zero-index triangle... simplest: emit each point 3x as degenerate tri
    n = len(pts)
    ipos = np.repeat(pts, 3, axis=0).astype(np.float32)
    # proper: build a POSITION accessor + indices making degenerate tris —
    # three.js renders GL_POINTS only with gl.POINTS; instead emit a
    # TRIANGLES mesh of tiny quads (billboard squares) so the render shows.
    s = 0.006
    quads = []
    for x, y, z in pts:
        quads.append([(x-s,y-s,z),(x+s,y-s,z),(x+s,y+s,z),(x-s,y+s,z)])
    qp = np.array(quads, dtype=np.float32).reshape(-1, 3)
    qidx = []
    for i in range(len(quads)):
        b = i * 4
        qidx += [[b, b+1, b+2], [b, b+2, b+3]]
    qidx = np.array(qidx, dtype=np.uint32)
    # gltf json+bin
    posb = qp.tobytes(); idxb = qidx.tobytes()
    binblob = posb + idxb
    pos_acc = {"bufferView":0,"componentType":5126,"count":len(qp),"type":"VEC3","max":qp.max(axis=0).tolist(),"min":qp.min(axis=0).tolist()}
    idx_acc = {"bufferView":1,"componentType":5125,"count":len(qidx)*3,"type":"SCALAR"}
    g = {"asset":{"version":"2.0"},"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0,"name":"pts"}],
         "meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1,"mode":4}],"name":"pts"}],
         "accessors":[pos_acc, idx_acc],
         "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":len(posb),"target":34962},
                        {"buffer":1,"byteOffset":len(posb),"byteLength":len(idxb),"target":34963}],
         "buffers":[{"byteLength":len(binblob)}]}
    js = json.dumps(g).encode(); pad = (4 - len(js)%4)%4; js += b' '*pad
    total = 12 + 8 + len(js) + 8 + len(binblob)
    with open(path,'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(binblob), 0x004E4942)); f.write(binblob)

write_miniglb('/home/z/my-project/public/game/models/_f28_killpts.glb', pos[kill])
write_miniglb('/home/z/my-project/public/game/models/_f28_footpts.glb',
              pos[(pos[:,0] > -0.05) & (pos[:,1] < 0.30) & (pos[:,2] <= 0.104)])
print("wrote _f28_killpts.glb (remnant candidate) and _f28_footpts.glb (staying foot zone)")
