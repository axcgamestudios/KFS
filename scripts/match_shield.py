#!/usr/bin/env python3
"""F28 — compare knight_statue.glb (the source) vs knight_rigged.glb (the game
rig) at foot level. Find: (1) where the statue's real feet are, (2) where the
statue shield is, (3) what the rig's left-foot slab actually is (duplicated
shield triangles? statue cloth?), by matching exact vertex positions between
the rigged knight_lower foot-level verts and the shield prop verts."""
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
    buf = data[bin_off+8:bin_off+8+bin_len]
    return gltf, buf

def read_pos(gltf, buf, acc_idx):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    count, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    stride = bv.get('byteStride', 0) or 12
    return np.array([struct.unpack_from('<3f', buf, off+k*stride) for k in range(count)])

# ---- statue
sg, sb = load('/home/z/my-project/public/game/models/knight_statue.glb')
print("STATUE meshes:")
statue_parts = {}
for i, m in enumerate(sg['meshes']):
    for pi, p in enumerate(m['primitives']):
        pos = read_pos(sg, sb, p['attributes']['POSITION'])
        key = f"{m.get('name','?')}#{pi}"
        statue_parts[key] = pos
        print(f"  [{i}.{pi}] {key}: {len(pos)} verts  X[{pos[:,0].min():+.3f},{pos[:,0].max():+.3f}] Y[{pos[:,1].min():+.3f},{pos[:,1].max():+.3f}] Z[{pos[:,2].min():+.3f},{pos[:,2].max():+.3f}]")

# ---- rigged
rg, rb = load('/home/z/my-project/public/game/models/knight_rigged.glb')
lower = read_pos(rg, rb, rg['meshes'][1]['primitives'][0]['attributes']['POSITION'])
shield_prop = read_pos(rg, rb, rg['meshes'][3]['primitives'][0]['attributes']['POSITION'])
wristL = np.array([-0.028+0.288+0.093-0.186, 0.836+0.26+0.446-0.186-0.316, -0.056+0.26])
shield_world = shield_prop + wristL

# the slab: rigged lower verts y<0.22, x>-0.05 (left+mid)
slab = lower[(lower[:,1] < 0.22) & (lower[:,0] > -0.05)]
print(f"\nRIG slab verts (y<0.22, x>-0.05): {len(slab)}  X[{slab[:,0].min():+.3f},{slab[:,0].max():+.3f}] Z[{slab[:,2].min():+.3f},{slab[:,2].max():+.3f}]")

# EXACT MATCH test: quantize slab verts vs shield prop verts (world)
q = lambda v: set(map(tuple, np.round(v, 4)))
shield_set = q(shield_world)
slab_set = q(slab)
exact = slab_set & shield_set
print(f"EXACT position matches slab↔shield-prop(world): {len(exact)} of {len(slab_set)}")

# also vs shield prop LOCAL coords (if never re-expressed)
shield_local = q(shield_prop)
exact2 = slab_set & shield_local
print(f"EXACT matches vs shield LOCAL coords: {len(exact2)}")

# vs STATUE: which statue mesh contains the slab verts? (statue may be scaled/offset!)
# rig_knight normalizes: feet->0, H 1.95, faces +Z. Try to find the transform:
# compare against each statue part's bbox and test scaled matches.
print("\nSTATUE parts' foot-level geometry (y-normalized check will follow):")
for key, pos in statue_parts.items():
    n_foot = ((pos[:,1] < pos[:,1].min() + 0.30) & (pos[:,0] > 0)).sum()
    print(f"  {key}: verts with y within 0.30 of bbox-min and x>0: {n_foot} / {len(pos)}")
