#!/usr/bin/env python3
"""F28 — precise census of knight_statue.glb (source statue) in the normalized
frame used by statue_viewer.html after the auto-fit patch:
  world = raw * (1.95 / 210.48), feet at y=0, +Y up, faces +Z, knight's LEFT = +X.
Answers: shield/sword placement, feet & stance, skirt/tassets ground clearance,
cape presence, plinth presence, hand positions."""
import json, struct
import numpy as np

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode())
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data[bin_off+8:bin_off+8+bin_len]

def read_pos(gltf, buf, acc_idx):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    count, off = acc['count'], bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride', 0) or 12
    return np.array([struct.unpack_from('<3f', buf, off+k*stride) for k in range(count)])

gltf, buf = load('/home/z/my-project/public/game/models/knight_statue.glb')
# mesh0 = Lower (node2/3), mesh1 = Upper (node4/5)
lower = read_pos(gltf, buf, gltf['meshes'][0]['primitives'][0]['attributes']['POSITION'])
upper = read_pos(gltf, buf, gltf['meshes'][1]['primitives'][0]['attributes']['POSITION'])

allv = np.vstack([lower, upper])
ymin, ymax = allv[:,1].min(), allv[:,1].max()
sc = 1.95 / (ymax - ymin)
def norm(p):
    w = p * sc
    w[:,1] -= ymin * sc
    return w
L, U = norm(lower), norm(upper)
A = np.vstack([L, U])
tag = np.array(['Lower']*len(L) + ['Upper']*len(U))

print(f"sc={sc:.6f}  statue world bbox: X[{A[:,0].min():+.3f},{A[:,0].max():+.3f}] "
      f"Y[{A[:,1].min():+.3f},{A[:,1].max():+.3f}] Z[{A[:,2].min():+.3f},{A[:,2].max():+.3f}]")

def rep(name, v, t=None):
    if len(v) == 0:
        print(f"{name:34s} — none")
        return
    print(f"{name:34s} {len(v):6d}v  X[{v[:,0].min():+.3f},{v[:,0].max():+.3f}] "
          f"Y[{v[:,1].min():+.3f},{v[:,1].max():+.3f}] Z[{v[:,2].min():+.3f},{v[:,2].max():+.3f}]"
          + (f"  [{t}]" if t is not None else ''))

# ---- 1. shield plate: left-front (+X,+Z) ground-level mass (both meshes) ----
# region established by match_shield.py / rig prop: x>0.0, z>0.05, y<1.15
plate_mask = (A[:,0] > 0.00) & (A[:,0] < 0.35) & (A[:,2] > 0.05) & (A[:,1] < 1.15) & (A[:,1] > -0.01)
plate = A[plate_mask]; ptag = tag[plate_mask]
rep("SHIELD-ish plate (+X front, y<1.15)", plate)
# flatness + normal via SVD
c = plate.mean(axis=0)
_, s, vt = np.linalg.svd(plate - c, full_matrices=False)
print(f"    SVD: spans {s[0]:.3f} x {s[1]:.3f}, thickness {s[2]:.4f} m -> plate normal ±{vt[2].round(3)}")
rep("    of which Upper-mesh", plate[ptag=='Upper'])
rep("    of which Lower-mesh", plate[ptag=='Lower'])

# ---- 2. sword: right-front (-X,+Z) tall thin mass ----
sword_mask = (A[:,0] < -0.10) & (A[:,2] > 0.05) & (A[:,1] < 1.15)
sw = A[sword_mask]; stag = tag[sword_mask]
rep("SWORD-ish (-X front, y<1.15)", sw)
rep("    of which Upper-mesh", sw[stag=='Upper'])
rep("    of which Lower-mesh", sw[stag=='Lower'])

# ---- 3. feet: ground level excluding shield/sword plates ----
foot_mask = (A[:,1] < 0.30) & ~((A[:,0] > 0.00) & (A[:,2] > 0.05) & (A[:,1] < 1.15)) \
            & ~((A[:,0] < -0.10) & (A[:,2] > 0.05) & (A[:,1] < 1.15))
F = A[foot_mask]
rep("FOOT level (y<0.30, excl. plates)", F)
fr = F[F[:,0] < -0.12]; fl = F[F[:,0] >= -0.12]
rep("  RIGHT foot region (x<-0.12)", fr)
rep("  LEFT foot region (x>=-0.12)", fl)
for nm, f in (('R', fr), ('L', fl)):
    if len(f):
        print(f"    foot {nm}: z-centroid {f[:,2].mean():+.3f}, x-centroid {f[:,0].mean():+.3f}, "
              f"sole y-min {f[:,1].min():+.3f}, toes z-max {f[:,2].max():+.3f}, heel z-min {f[:,2].min():+.3f}")

# ---- 4. body skirt/tassets: lowest body geometry per octant (excl. shield/sword/feet) ----
body = A[(A[:,1] > 0.0) & (A[:,1] < 1.3) & ~plate_mask & ~sword_mask & (A[:,1] < 0.30)]
rep("BODY at y<0.30 (skirt bottoms)", body)
for qname, xm, zm in [('front (z>0)', None, 1), ('back (z<0)', None, -1),
                      ("knight's LEFT (+x)", 1, None), ("knight's RIGHT (-x)", -1, None)]:
    m = np.ones(len(body), bool)
    if xm is None: m &= (body[:,2] * zm) > 0
    else: m &= (body[:,0] * xm) > 0
    v = body[m]
    if len(v):
        print(f"    skirt {qname:22s} lowest y={v[:,1].min():+.3f}  ({len(v)}v)")

# ---- 5. cape check: Upper-mesh back sheet from shoulders to below waist ----
cape = U[(U[:,2] < -0.15) & (U[:,1] < 1.6)]
rep("UPPER back (z<-0.15) all", cape)
cape_low = cape[cape[:,1] < 1.0]
rep("UPPER back below y=1.0", cape_low)
if len(cape_low):
    print(f"    back-sheet lowest point y={cape_low[:,1].min():+.3f}, z-range "
          f"[{cape_low[:,2].min():+.3f},{cape_low[:,2].max():+.3f}]")

# ---- 6. plinth: anything under the feet wider than the feet? y<0.02 census ----
ground = A[A[:,1] < 0.02]
rep("GEOMETRY at y<0.02 (touching ground)", ground)
gplate = ground[plate_mask[A[:,1] < 0.02]]
print(f"    at ground: shield-plate {len(gplate)}v; other = {len(ground)-len(gplate)}v")
other = ground[~plate_mask[A[:,1] < 0.02]]
if len(other):
    print(f"    other-at-ground spans X[{other[:,0].min():+.3f},{other[:,0].max():+.3f}] "
          f"Z[{other[:,2].min():+.3f},{other[:,2].max():+.3f}] — check vs foot/sword zones")

# ---- 7. hands: upper-mesh geometry at wrist height ----
for side, xr in (("RIGHT (-X)", A[:,0] < -0.05), ("LEFT (+X)", A[:,0] > 0.05)):
    hand = A[xr & (A[:,1] > 0.95) & (A[:,1] < 1.15) & (np.abs(A[:,2]) < 0.4)]
    if len(hand):
        print(f"HAND zone {side}: {len(hand)}v  y[{hand[:,1].min():+.3f},{hand[:,1].max():+.3f}] "
              f"z[{hand[:,2].min():+.3f},{hand[:,2].max():+.3f}] x[{hand[:,0].min():+.3f},{hand[:,0].max():+.3f}]")

# ---- 8. stance: ankle positions proxy = foot z-centroids ----
print(f"\nSTANCE: right-foot z-centroid {fr[:,2].mean():+.3f} vs left {fl[:,2].mean():+.3f} "
      f"(more + = more forward); ankle spread x: R {fr[:,0].mean():+.3f}, L {fl[:,0].mean():+.3f}")
