#!/usr/bin/env python3
"""F27 probe B — map the verts near the left forearm chain in the SOURCE
statue: which are hand (must ride the wrist) vs fauld/skirt (must stay
pelvis/root). Decides the reclaim + clamp gates for rig v4."""
import json, struct
import numpy as np
import sys
sys.path.insert(0, 'scripts')
from rig_knight import load_glb, get_world_meshes, classify_point, find_shield, BONE_SEGMENTS, dist_to_segment, SRC

js, bind = load_glb(SRC)
meshes = get_world_meshes(js, bind)
up = next(m for m in meshes if m['tag'] == 'Upper')
lo = next(m for m in meshes if m['tag'] == 'Lower')
_, shield_mask = find_shield(js, bind, meshes)

lo_tri_of_vert = np.repeat(np.arange(len(lo['indices']) // 3), 3)
shield_vert_mask = shield_mask[lo_tri_of_vert[lo['indices']]].reshape(-1, 3).any(axis=1)

def vec_sword(c):
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    return (x >= -35) & (x <= -18) & (z >= 13) & (z <= 28) & (y >= -104) & (y <= 8)

for tag, m, svm in (('UPPER', up, None), ('LOWER', lo, shield_vert_mask)):
    tri = m['positions'][m['indices']].reshape(-1, 3, 3)
    cen = tri.mean(axis=1)
    # drop sword + shield verts from the census (they become props)
    keep_tri = ~vec_sword(cen)
    if svm is not None:
        keep_tri = keep_tri & ~svm
    vidx = m['indices'].reshape(-1, 3)[keep_tri].reshape(-1)
    uniq = np.unique(vidx)
    P = m['positions'][uniq]
    parts = [classify_point(p[0], p[1], p[2]) for p in P]
    parts = np.array(parts)
    # distance to the left forearm chain
    fe, fw = np.array(BONE_SEGMENTS['j_elbowL'][0]), np.array(BONE_SEGMENTS['j_elbowL'][1])
    d = np.array([dist_to_segment(p, fe, fw) for p in P])
    wl = np.array(BONE_SEGMENTS['j_wristL'][0]); wr = np.array(BONE_SEGMENTS['j_wristL'][1])
    dw = np.array([dist_to_segment(p, wl, wr) for p in P])
    near = (d < 8) & (P[:, 0] >= 10)
    print(f'--- {tag}: {near.sum()} verts within 8 of left forearm chain (x>=10) ---')
    from collections import Counter
    print('   their current parts:', Counter(parts[near]).most_common())
    # the ones that are NOT arm — where are they?
    bad = near & (parts != 'armL')
    if bad.any():
        Q = P[bad]
        print(f'   non-arm near-chain verts: {len(Q)}')
        print('   x range', Q[:, 0].min(), Q[:, 0].max(), '| y range', Q[:, 1].min(), Q[:, 1].max(), '| z range', Q[:, 2].min(), Q[:, 2].max())
        # bucket by zone
        hand = (Q[:, 2] >= 16) & (Q[:, 1] <= 14)
        skirt = ~hand
        print(f'   hand-zone (z>=16,y<=14): {hand.sum()} | other: {skirt.sum()}')
        if skirt.sum():
            print('   OTHER verts sample:', np.round(Q[skirt][:12], 1).tolist())
        # how far from the wrist segment
        print('   dw stats of non-arm near-chain:', np.round(np.percentile(dw[bad], [50, 90, 100]), 1))
