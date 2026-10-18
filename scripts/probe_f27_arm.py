#!/usr/bin/env python3
"""F27 probe — where do the LEFT-hand/gauntlet vertices' weights actually go?

The statue's left forearm crosses the body midline (elbow x=38 -> wrist x=14)
but r_armL demanded x>=17: verts at the grip (x 14..17, y<13) fell through
classify_point to the DEFAULT 'torso'. When the game swings/extends the left
arm (bow aim: shoulderL -1.4 rad), those verts stay welded to the chest —
the visible "brazo sin espada se estira" bug.

This probe loads the DEPLOYED knight_rigged.glb and reports, for verts near
the left-arm skeleton chain (and the right arm as control), the dominant
bone. Run BEFORE and AFTER the rig v4 fix."""
import json, struct, sys
import numpy as np

GLB = 'public/game/models/knight_rigged.glb'
GAME_SCALE = 1.95 / 210.0

def load_glb(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'glTF'
    total = struct.unpack('<I', data[8:12])[0]
    off = 12; chunks = []
    while off < total:
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        chunks.append((ctype, data[off + 8:off + 8 + clen]))
        off += 8 + clen
    return json.loads(chunks[0][1].decode()), {c[0]: c[1] for c in chunks[1:]}

js, bins = load_glb(GLB)
BIN = bins[0x004E4942]

def acc(idx):
    a = js['accessors'][idx]
    v = js['bufferViews'][a['bufferView']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    comp = {'VEC3': 3, 'VEC2': 2, 'VEC4': 4, 'SCALAR': 1, 'MAT4': 16}[a['type']]
    fmt = {5126: 'f4', 5125: 'u4', 5123: 'u2', 5121: 'u1'}[a['componentType']]
    dt = np.frombuffer(BIN, dtype=np.dtype(fmt), count=a['count'] * comp, offset=off)
    return dt.reshape(a['count'], comp)

# find the skinned meshes (knight_upper / knight_lower)
name_of = {i: n.get('name', '') for i, n in enumerate(js['nodes'])}
mesh_nodes = [i for i, n in enumerate(js['nodes']) if 'mesh' in n and 'skin' in n]
print('skinned mesh nodes:', [name_of[i] for i in mesh_nodes])

# joint name list from the first skin
skin = js['skins'][0]
joint_names = [name_of[j] for j in skin['joints']]
print('bones:', joint_names)

# statue-space bone pivots (from rig_knight.py, for reference geometry)
to_game = lambda p: np.array([p[0] * GAME_SCALE, (p[1] + 104.0) * GAME_SCALE, p[2] * GAME_SCALE])
SEGS = {
    'j_shoulderL': ((28, 62, 0), (38, 42, -6)),
    'j_elbowL':    ((38, 42, -6), (18, 8, 22)),
    'j_wristL':    ((22, 10, 16), (14, 2, 28)),
    'j_shoulderR': ((-30, 62, 0), (-38, 36, 10)),
    'j_elbowR':    ((-38, 36, 10), (-27, 10, 18)),
    'j_wristR':    ((-30, 12, 16), (-24, 2, 21)),
}

def dist_seg(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / np.dot(ab, ab), 0, 1)
    q = a[None, :] + t[:, None] * ab[None, :]
    return np.linalg.norm(p - q, axis=-1)

for ni in mesh_nodes:
    n = js['nodes'][ni]
    for p in js['meshes'][n['mesh']]['primitives']:
        pos = acc(p['attributes']['POSITION']).astype(np.float64)
        wts = acc(p['attributes']['WEIGHTS_0']).astype(np.float64)
        jnt = acc(p['attributes']['JOINTS_0']).astype(np.int64)
        for side in ('L', 'R'):
            # verts near the whole arm chain (9 statue-units) and near the hand (6.5)
            chain = [to_game(np.array(SEGS[f'j_{b}{side}'][k])) for b in ('shoulder', 'elbow', 'wrist') for k in (0, 1)]
            d_chain = np.minimum.reduce([dist_seg(pos, chain[i], chain[i + 1]) for i in range(0, 6, 2)])
            # hand = near the wrist segment only
            ws, we = to_game(np.array(SEGS[f'j_wrist{side}'][0])), to_game(np.array(SEGS[f'j_wrist{side}'][1]))
            d_hand = dist_seg(pos, ws, we)
            arm_mask = d_chain < 9 * GAME_SCALE
            hand_mask = d_hand < 6.5 * GAME_SCALE
            dom = jnt[np.arange(len(pos)), np.argmax(wts, axis=1)]
            bad_arm = arm_mask & ~np.isin(dom, [joint_names.index(f'j_shoulder{side}'), joint_names.index(f'j_elbow{side}'), joint_names.index(f'j_wrist{side}')])
            bad_hand = hand_mask & (dom != joint_names.index(f'j_wrist{side}'))
            print(f"[{name_of[ni]}] {side}: arm-chain verts={arm_mask.sum()}, mis-ranked={bad_arm.sum()}, "
                  f"hand verts={hand_mask.sum()}, hand NOT on wrist={bad_hand.sum()}")
            if bad_hand.any():
                from collections import Counter
                print('   hand verts dominated by:', Counter([joint_names[b] for b in dom[bad_hand]]).most_common())
print('done')
