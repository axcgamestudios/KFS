#!/usr/bin/env python3
"""F28 — deep dive on knight_statue.glb: what geometry exists at foot level
(statue y < -85) in each of the 2 meshes, and where is the shield really.
This determines what the rigger misclassified as the left leg."""
import json, struct
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data[bin_off+8:bin_off+8+bin_len]

def read_pos(gltf, buf, acc_idx):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    count, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    stride = bv.get('byteStride', 0) or 12
    return np.array([struct.unpack_from('<3f', buf, off+k*stride) for k in range(count)])

sg, sb = load('/home/z/my-project/public/game/models/knight_statue.glb')
parts = []
for i, m in enumerate(sg['meshes']):
    for pi, p in enumerate(m['primitives']):
        parts.append((f"m{i}p{pi}", read_pos(sg, sb, p['attributes']['POSITION'])))
        print(f"{f'm{i}p{pi}'}: {len(parts[-1][1])} verts")

fig, axes = plt.subplots(1, 3, figsize=(21, 7), constrained_layout=True)
for name, pos in parts:
    foot = pos[pos[:,1] < -80]
    print(f"\n{name} foot-level (y<-80): {len(foot)} verts")
    if len(foot):
        print(f"   X[{foot[:,0].min():+.1f},{foot[:,0].max():+.1f}] Y[{foot[:,1].min():+.1f},{foot[:,1].max():+.1f}] Z[{foot[:,2].min():+.1f},{foot[:,2].max():+.1f}]")
    # scatter: top view X-Z, color by mesh
    axes[0].scatter(pos[:,0], pos[:,2], s=0.5, alpha=0.25, label=f"{name} all")
    if len(foot):
        axes[1].scatter(foot[:,0], foot[:,2], s=2, alpha=0.7, label=f"{name} y<-80")
    axes[2].scatter(pos[:,0], pos[:,1], s=0.5, alpha=0.25, label=f"{name} front")

axes[0].set_title('STATUE top view (all verts) X-Z'); axes[0].set_aspect('equal'); axes[0].legend(); axes[0].grid(alpha=.3)
axes[1].set_title('STATUE foot level (y<-80) X-Z'); axes[1].set_aspect('equal'); axes[1].legend(); axes[1].grid(alpha=.3)
axes[2].set_title('STATUE front view X-Y'); axes[2].set_aspect('equal'); axes[2].legend(); axes[2].grid(alpha=.3)
plt.savefig('/home/z/my-project/scripts/statue_analysis.png', dpi=110)

# quantify the mass at foot level by X-Z quadrant
for name, pos in parts:
    foot = pos[pos[:,1] < -85]
    if not len(foot): continue
    right = foot[foot[:,0] < -9]; left = foot[foot[:,0] > -9]
    if len(right):
        print(f"\n{name} y<-85: RIGHT region (x<-9): {len(right)} verts  X[{right[:,0].min():+.1f},{right[:,0].max():+.1f}] Z[{right[:,2].min():+.1f},{right[:,2].max():+.1f}]")
    if len(left):
        print(f"{name} y<-85: LEFT region (x>-9): {len(left)} verts  X[{left[:,0].min():+.1f},{left[:,0].max():+.1f}] Z[{left[:,2].min():+.1f},{left[:,2].max():+.1f}]")
    # histogram of left region z
    hz, edges = np.histogram(left[:,2], bins=12)
    print('   left-region Z histogram:', {f'{edges[i]:.0f}..{edges[i+1]:.0f}': int(hz[i]) for i in range(12) if hz[i] > 0})
    # how much of left region is beyond the plausible foot x-range (the left foot should mirror right foot x range)?
    if len(right):
        rlo, rhi = right[:,0].min(), right[:,0].max()
        print(f'   right foot X range: [{rlo:.1f},{rhi:.1f}] -> mirrored left foot should be [{-rhi:.1f},{-rlo:.1f}]')
        mirror = left[(left[:,0] >= -rhi) & (left[:,0] <= -rlo)]
        beyond = left[(left[:,0] < -rhi) | (left[:,0] < -9) & (left[:,0] < -rhi)]
        inband = left[(left[:,0] > -rhi) & (left[:,0] <= -rlo)]
        print(f'   left verts inside mirrored foot band: {len(inband)}, medial/beyond: {len(left)-len(inband)}')
