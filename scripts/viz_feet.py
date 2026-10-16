#!/usr/bin/env python3
"""F28 — visualize the FOOT-LEVEL geometry of knight_rigged.glb knight_lower,
colored by dominant bone, vs the shield prop. Shows whether the monster left
foot is an actual foot or shield remnants baked in the body mesh."""
import json, struct
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

PATH = '/home/z/my-project/public/game/models/knight_rigged.glb'
with open(PATH, 'rb') as f:
    data = f.read()
json_len, _ = struct.unpack_from('<II', data, 12)
gltf = json.loads(data[20:20+json_len].decode('utf-8'))
bin_off = 20 + json_len
while bin_off % 4: bin_off += 1
bin_len, _ = struct.unpack_from('<II', data, bin_off)
buffer = data[bin_off+8:bin_off+8+bin_len]

def read_acc(acc_idx, normalized=False):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    comp = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[acc['type']]
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[acc['componentType']]
    count = acc['count']
    off = bv.get('byteOffset',0) + acc.get('byteOffset',0)
    stride = bv.get('byteStride',0) or struct.calcsize('<'+fmt)*comp
    out = np.empty((count, comp))
    for k in range(count):
        po = off + k*stride
        if comp == 3: out[k] = struct.unpack_from('<3f', buffer, po)
        elif comp == 4:
            if acc['componentType'] == 5121:
                raw = np.array(struct.unpack_from('<4B', buffer, po), dtype=np.float32)
                out[k] = raw/255.0 if normalized else raw
            else: out[k] = struct.unpack_from('<4f', buffer, po)
    return out

meshes = gltf['meshes']
# lower mesh = 1
p = meshes[1]['primitives'][0]
pos = read_acc(p['attributes']['POSITION'])
joints = read_acc(p['attributes']['JOINTS_0']).astype(int)
weights = read_acc(p['attributes']['WEIGHTS_0'], normalized=True)
skin = gltf['skins'][0]
jnames = [gltf['nodes'][j]['name'] for j in skin['joints']]
dom = np.argmax(weights, axis=1)
dom_names = np.array([jnames[j] for j in joints[np.arange(len(pos)), dom]])

# shield prop mesh = 3 (local coords; attach under wristL)
sp = meshes[3]['primitives'][0]
spos = read_acc(sp['attributes']['POSITION'])
# wristL world ≈ compute from node chain
nodes = gltf['nodes']
def node_chain(idx, out):
    out.append(idx)
    for c in nodes[idx].get('children', []):
        if 'mesh' not in nodes[c] or True:
            node_chain(c, out)
# wristL = node 8; world position:
# j_root(-0.028,0.836,0) -> j_torso(0,0.26,0) -> j_shoulderL(0.288,0.446,0) -> j_elbowL(0.093,-0.186,-0.056) -> j_wristL(-0.186,-0.316,0.26)
wristL = np.array([-0.028+0+0.288+0.093-0.186, 0.836+0.26+0.446-0.186-0.316, 0+0+0-0.056+0.26])
shield_world = spos + wristL

feet = pos[pos[:,1] < 0.22]
feet_dom = dom_names[pos[:,1] < 0.22]
fig, axes = plt.subplots(2, 2, figsize=(16, 14), constrained_layout=True)
colors = {'j_ankleL':'#e41a1c','j_ankleR':'#377eb8','j_kneeL':'#ff7f00','j_kneeR':'#4daf4a',
          'j_hipL':'#984ea3','j_hipR':'#f781bf','j_root':'#888888'}
for (view, (a,b), title) in [((0,0),(0,1),'Front view (X-Y)'), ((0,1),(0,2),'Side view (X-Z)'), ((1,0),(1,2),'Top view (Y-Z)')]:
    ax = axes[view]
    for bn, col in colors.items():
        m = feet_dom == bn
        if m.sum():
            ax.scatter(feet[m,a], feet[m,b], s=1.5, c=col, label=f'{bn} ({m.sum()})', alpha=0.6)
    # shield outline
    ax.scatter(shield_world[:,a if a<2 else 0], shield_world[:,b if b>=1 else 1], s=1, c='k', marker='x', alpha=0.35, label='shield prop')
    ax.set_title(title); ax.legend(markerscale=8, fontsize=8); ax.set_aspect('equal'); ax.grid(alpha=0.3)
# 4th panel: ankleL verts closeup top view
ax = axes[1,1]
mL = feet_dom == 'j_ankleL'
ax.scatter(feet[mL,0], feet[mL,2], s=2, c='#e41a1c')
ax.scatter(feet[feet_dom=='j_ankleR',0], feet[feet_dom=='j_ankleR',2], s=2, c='#377eb8')
ax.scatter(shield_world[:,0], shield_world[:,2], s=1, c='k', marker='x', alpha=0.3)
ax.set_title('j_ankleL verts (red) vs j_ankleR (blue) vs shield prop (x) — TOP'); ax.set_aspect('equal'); ax.grid(alpha=0.3)
ax.set_xlabel('X'); ax.set_ylabel('Z')
plt.savefig('/home/z/my-project/scripts/feet_analysis.png', dpi=110)
print('saved. ankleL foot-level verts:', (feet_dom=='j_ankleL').sum(), ' ankleR:', (feet_dom=='j_ankleR').sum())
# check flatness of ankleL verts: SVD
L = feet[feet_dom=='j_ankleL']
c = L.mean(axis=0); u,s,vt = np.linalg.svd(L-c, full_matrices=False)
print('ankleL verts SVD singular values (flatness):', np.round(s,4), ' thickness = %.4f m' % s[2])
R = feet[feet_dom=='j_ankleR']
c2 = R.mean(axis=0); u2,s2,vt2 = np.linalg.svd(R-c2, full_matrices=False)
print('ankleR verts SVD singular values (flatness):', np.round(s2,4), ' thickness = %.4f m' % s2[2])
