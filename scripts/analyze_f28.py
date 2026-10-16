#!/usr/bin/env python3
"""F28 diagnosis — dump knight_rigged.glb structure: nodes, meshes, materials,
foot geometry extent, and hunt for any shield-like geometry ANYWHERE (separate
props AND triangles baked inside the merged body meshes)."""
import json, struct, sys
from collections import defaultdict

PATH = '/home/z/my-project/public/game/models/knight_rigged.glb'

with open(PATH, 'rb') as f:
    data = f.read()

magic, version, length = struct.unpack_from('<III', data, 0)
assert magic == 0x46546C67, 'not a GLB'
json_len, json_pad = struct.unpack_from('<II', data, 12)
gltf = json.loads(data[20:20+json_len].decode('utf-8'))
bin_start = 20 + json_len + (json_pad and (json_pad - ((20+json_len) % json_pad)) % json_pad or 0)
# simpler: chunk header at 12 says json_len; next chunk starts at 20+json_len (aligned)
bin_chunk_off = 20 + json_len
while bin_chunk_off % 4:
    bin_chunk_off += 1
bin_len, _ = struct.unpack_from('<II', data, bin_chunk_off)
bin_data = data[bin_chunk_off+8:bin_chunk_off+8+bin_len]

print(f"GLB v{version}, {length} bytes; json {json_len}, bin {bin_len}")
print(f"\n=== NODES ({len(gltf['nodes'])}) ===")
meshes = gltf.get('meshes', [])
skins = gltf.get('skins', [])
for i, n in enumerate(gltf['nodes']):
    parts = []
    if 'mesh' in n: parts.append(f"mesh={n['mesh']}({meshes[n['mesh']].get('name','?')})")
    if 'skin' in n: parts.append(f"skin={n['skin']}")
    if 'children' in n: parts.append(f"children={n['children']}")
    if 'translation' in n: parts.append(f"t={[round(v,3) for v in n['translation']]}")
    if 'rotation' in n: parts.append(f"r={[round(v,3) for v in n['rotation']]}")
    if 'scale' in n: parts.append(f"s={[round(v,3) for v in n['scale']]}")
    print(f"  [{i}] {n.get('name','?')}: {' '.join(parts)}")

print(f"\n=== MESHES ===")
for i, m in enumerate(meshes):
    prims = m['primitives']
    total_idx = 0
    for p in prims:
        acc_idx = p['indices']
        total_idx += gltf['accessors'][acc_idx]['count']
    print(f"  [{i}] {m.get('name','?')}: {len(prims)} prims, {total_idx//3} tris, material={[p.get('material') for p in prims]}")

print(f"\n=== MATERIALS ===")
for i, mat in enumerate(gltf.get('materials', [])):
    print(f"  [{i}] {mat.get('name','?')}")

print(f"\n=== SKINS ===")
for i, s in enumerate(skins):
    jnames = [gltf['nodes'][j].get('name','?') for j in s['joints']]
    print(f"  [{i}] joints: {jnames}")

print(f"\n=== SCENE ROOTS ===")
for r in gltf['scenes'][gltf.get('scene', 0)]['nodes']:
    print(f"  root node [{r}] {gltf['nodes'][r].get('name','?')}")

# ---- vertex analysis per mesh: bounds + find shield-like + foot regions ----
print(f"\n=== VERTEX ANALYSIS ===")
bufs = gltf['buffers']
buffer = bin_data  # single GLB bin

def read_accessor(acc_idx, target):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    comp = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[acc['type']]
    ctype = acc['componentType']
    fmts = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}
    fmt = fmts[ctype]
    itemsize = struct.calcsize(fmt) * comp
    off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    count = acc['count']
    stride = bv.get('byteStride', 0) or itemsize
    out = []
    base = off
    for k in range(count):
        po = base + k * stride
        if comp == 3:
            out.append(struct.unpack_from('<3f', buffer, po))
        elif comp == 4:
            if ctype == 5121:  # normalized ubyte (joints/weights)
                raw = struct.unpack_from('<4B', buffer, po)
                if target == 'joint':
                    out.append(raw)
                else:
                    m = max(raw) or 1
                    out.append(tuple(v / 255.0 for v in raw))
            elif ctype == 5126:
                out.append(struct.unpack_from('<4f', buffer, po))
        elif comp == 2:
            out.append(struct.unpack_from('<2f', buffer, po))
        elif comp == 1:
            out.append(struct.unpack_from('<'+fmt, buffer, po)[0])
    return out

skin_of_mesh = {}
for i, n in enumerate(gltf['nodes']):
    if 'skin' in n:
        skin_of_mesh[n['mesh']] = n['skin']

joint_names = None
for mi, m in enumerate(meshes):
    for pi, p in enumerate(m['primitives']):
        pos = read_accessor(p['attributes']['POSITION'], 'pos')
        nverts = len(pos)
        xs = [v[0] for v in pos]; ys = [v[1] for v in pos]; zs = [v[2] for v in pos]
        print(f"\n  mesh[{mi}] {m.get('name','?')} prim{pi}: {nverts} verts")
        print(f"    bbox X [{min(xs):+.3f},{max(xs):+.3f}] Y [{min(ys):+.3f},{max(ys):+.3f}] Z [{min(zs):+.3f},{max(zs):+.3f}]")
        if 'JOINTS_0' in p['attributes'] and mi in skin_of_mesh:
            skin = skins[skin_of_mesh[mi]]
            jnames = [gltf['nodes'][j].get('name','?') for j in skin['joints']]
            jidx = read_accessor(p['attributes']['JOINTS_0'], 'joint')
            widx = read_accessor(p['attributes']['WEIGHTS_0'], 'weight')
            # dominant bone per vert
            dom = defaultdict(list)
            for k in range(nverts):
                w = widx[k]; j = jidx[k]
                bi = max(range(4), key=lambda b: w[b])
                dom[jnames[j[bi]]].append(k)
            print(f"    dominant-bone vertex counts:")
            for bn, lst in sorted(dom.items(), key=lambda kv: -len(kv[1])):
                ys2 = [ys[k] for k in lst]; zs2 = [zs[k] for k in lst]; xs2 = [xs[k] for k in lst]
                print(f"      {bn:12s}: {len(lst):5d} verts  y[{min(ys2):+.2f},{max(ys2):+.2f}] x[{min(xs2):+.2f},{max(xs2):+.2f}] z[{min(zs2):+.2f},{max(zs2):+.2f}]")
            # foot deep-dive: verts classified to ankle + everything below y=-0.85m
            foot_names = ('j_ankleL', 'j_ankleR')
            footv = [k for k in range(nverts) if jnames[jidx[k][max(range(4), key=lambda b: widx[k][b])]] in foot_names]
            if footv:
                fy = sorted(ys[k] for k in footv); fz = sorted(zs[k] for k in footv); fx = sorted(xs[k] for k in footv)
                print(f"    ANKLE-WEIGHTED verts: {len(footv)}  X[{fx[0]:+.3f},{fx[-1]:+.3f}] ({fx[-1]-fx[0]:.3f} wide) Y[{fy[0]:+.3f},{fy[-1]:+.3f}] ({fy[-1]-fy[0]:.3f} tall) Z[{fz[0]:+.3f},{fz[-1]:+.3f}] ({fz[-1]-fz[0]:.3f} LONG)")
                # toe extent: lowest 20% verts z range
                lowfoot = [k for k in footv if ys[k] < fy[0] + 0.06]
                lz = sorted(zs[k] for k in lowfoot)
                print(f"    sole verts (bottom 6cm): {len(lowfoot)}  Z[{lz[0]:+.3f},{lz[-1]:+.3f}]")
print("\nDONE")
