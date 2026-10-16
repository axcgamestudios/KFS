#!/usr/bin/env python3
"""F28 ARMS SURGERY — rigid plate banding for both arms of knight_rigged.glb.

PROBLEM (probe_f28_arm.ts, offline skinning math on the live GLB):
  the swordless (LEFT) arm — and the armed one — are skinned with soft
  distance-based weights that LEAK across every joint:
    LEFT  upperArm 76% shoulder (12% torso, 10% elbow leak)
    LEFT  forearm  75% elbow (13% wrist + 13% shoulder leak)
    LEFT  hand     68% wrist (31% elbow leak -> gauntlet wobbles with the elbow)
    RIGHT forearm  64% elbow (22% wrist + 14% shoulder leak)
  Measured under the REAL in-game poses the mesh tears: edge-stretch ratios
  up to 3.7x (left sprint back-swing), 4.9x (shield charge), 5.3x (swim),
  14.8x (right heavy windup); thousands of edges >1.05. That IS the user's
  "el brazo sin espada tiene algunos bugs de estiramiento".

FIX (same philosophy as Fase 26's rigid sabatons — plate does not shear):
  every vertex whose dominant bone is an arm bone is re-banded by its
  along-chain coordinate t (0 at the shoulder pivot, 1 at the elbow pivot,
  2 at the wrist pivot — projection onto the live bone chain):
      t <  1.0  -> 100% j_shoulderX   (rerebrace + pauldron: rigid with the arm)
      1.0<= t <1.9  -> 100% j_elbowX  (couter + vambrace: rigid with the forearm)
      t >= 1.9  -> 100% j_wristX      (gauntlet + fingers: rigid with the hand)
  The hinges land ON the pivot lines, inside the plate overlaps — the elbow
  opens on the outside of a bend and pinches on the inside, like real armor.
  No vertex-count or byte-length changes: JOINTS_0/WEIGHTS_0 patched in place
  in the BIN chunk, JSON untouched, images untouched.
"""
import json, struct, shutil
import numpy as np

SRC = '/home/z/my-project/public/game/models/knight_rigged.glb'
BAK = '/home/z/my-project/scripts/knight_rigged.glb.f28armbak'

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data, bytearray(data[bin_off+8:bin_off+8+bin_len]), bin_off

def read_raw(gltf, buf, ai):
    acc = gltf['accessors'][ai]
    bv = gltf['bufferViews'][acc['bufferView']]
    off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    n = acc['count']
    ct = acc['componentType']; typ = acc['type']
    comps = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[typ]
    fmt = {5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[ct]
    sz = {'b':1,'B':1,'h':2,'H':2,'I':4,'f':4}[fmt]
    stride = bv.get('byteStride', sz*comps)
    out = np.empty((n, comps), dtype=np.float64)
    for i in range(n):
        base = off + i*stride
        vals = struct.unpack_from('<' + fmt*comps, buf, base)
        out[i] = vals
    return out

def joint_names(gltf):
    return [gltf['nodes'][j].get('name', '') for j in gltf['skins'][0]['joints']]

def world_joint_pos(gltf):
    """Bind world position of every joint node (walk parents, TRS; the rig
    ships identity rotations at bind but compute it properly anyway)."""
    children = {}
    for ni, n in enumerate(gltf['nodes']):
        for c in n.get('children', []):
            children[c] = ni
    def local_matrix(n):
        t = n.get('translation', [0,0,0]); r = n.get('rotation', [0,0,0,1]); s = n.get('scale', [1,1,1])
        # quaternion -> matrix
        x,y,z,w = r
        m = np.eye(4)
        m[:3,:3] = np.array([
            [1-2*(y*y+z*z), 2*(x*y-w*z),   2*(x*z+w*y)],
            [2*(x*y+w*z),   1-2*(x*x+z*z), 2*(y*z-w*x)],
            [2*(x*z-w*y),   2*(y*z+w*x),   1-2*(x*x+y*y)]]) * np.outer(np.array(s), np.ones(3)).T if False else np.array([
            [1-2*(y*y+z*z), 2*(x*y-w*z),   2*(x*z+w*y)],
            [2*(x*y+w*z),   1-2*(x*x+y*z*0), 2*(y*z-w*x)],
            [2*(x*z-w*y),   2*(y*z+w*x),   1-2*(x*x+y*y)]])
        m[:3, 3] = t
        return m
    world = {}
    def walk(ni, parent_m):
        n = gltf['nodes'][ni]
        m = parent_m @ local_matrix(n)
        world[ni] = m
        for c in n.get('children', []):
            walk(c, m)
    roots = [ni for ni in range(len(gltf['nodes'])) if ni not in children]
    for r in roots:
        walk(r, np.eye(4))
    return world

def chain_t(v, S, E, W):
    """along-chain coordinate: 0 at S, 1 at E, 2 at W (closest segment wins)."""
    SE = E - S; EW = W - E
    t1 = float(np.clip(np.dot(v - S, SE) / np.dot(SE, SE), 0, 1))
    d1 = np.linalg.norm(S + t1*SE - v)
    t2 = float(np.clip(np.dot(v - E, EW) / np.dot(EW, EW), 0, 1))
    d2 = np.linalg.norm(E + t2*EW - v)
    return t1 if d1 <= d2 else 1.0 + t2

def main():
    shutil.copyfile(SRC, BAK)
    gltf, data, buf, bin_off = load(SRC)
    jn = joint_names(gltf)
    world = world_joint_pos(gltf)
    node_of = {}
    for ni, n in enumerate(gltf['nodes']):
        node_of[n.get('name','')] = ni
    def jpos(name):
        m = world[node_of[name]]
        return m[:3, 3].copy()

    # sanity: the mesh nodes must be identity-transformed (positions are world)
    for mname in ('knight_upper', 'knight_lower'):
        ni = node_of.get(mname)
        if ni is not None:
            n = gltf['nodes'][ni]
            assert n.get('translation', [0,0,0]) == [0,0,0] and n.get('rotation') is None, \
                f'{mname} node transform is not identity'
    print('[ok] mesh nodes are identity — POSITION arrays are world space')

    chains = {}
    for side in ('L', 'R'):
        S, E, W = jpos(f'j_shoulder{side}'), jpos(f'j_elbow{side}'), jpos(f'j_wrist{side}')
        chains[side] = (S, E, W)
        print(f'[chain {side}] S={np.round(S,3)} E={np.round(E,3)} W={np.round(W,3)}')

    report = {}
    for mi, mesh in enumerate(gltf['meshes']):
        name = mesh.get('name', '')
        if name not in ('knight_upper', 'knight_lower'):
            continue
        p = mesh['primitives'][0]
        pos = read_raw(gltf, buf, p['attributes']['POSITION'])
        jts = read_raw(gltf, buf, p['attributes']['JOINTS_0']).astype(int)
        wts = read_raw(gltf, buf, p['attributes']['WEIGHTS_0'])
        n = len(pos)
        dom = [jn[jts[i, int(np.argmax(wts[i]))]] for i in range(n)]

        changed = 0
        for side in ('L', 'R'):
            S, E, W = chains[side]
            arm = {f'j_shoulder{side}', f'j_elbow{side}', f'j_wrist{side}'}
            sh_i, el_i, wr_i = jn.index(f'j_shoulder{side}'), jn.index(f'j_elbow{side}'), jn.index(f'j_wrist{side}')
            counts = {'shoulder': 0, 'elbow': 0, 'wrist': 0, 'flank->torso': 0, 'seam-kept': 0}
            def d_chain(v):
                SE = E - S; EW = W - E
                t1 = float(np.clip(np.dot(v - S, SE) / np.dot(SE, SE), 0, 1))
                d1 = np.linalg.norm(S + t1*SE - v)
                t2 = float(np.clip(np.dot(v - E, EW) / np.dot(EW, EW), 0, 1))
                d2 = np.linalg.norm(E + t2*EW - v)
                return min(d1, d2)
            for i in range(n):
                if dom[i] not in arm:
                    continue
                v = pos[i]
                dc = d_chain(v)
                t = chain_t(v, S, E, W)
                if dc > 0.13:
                    # Beyond the arm tube: the FLANK (ribcage side). The rigger's
                    # r_armX slab (statue x beyond the arm line, y 0..78) handed the
                    # whole side of the ribcage to the arm bones — with soft weights
                    # it dragged the flank with every arm swing (the user's
                    # "stretching"), with rigid ones it rips it off the torso.
                    if v[1] < 1.45 and np.linalg.norm(v - E) > 0.10 and np.linalg.norm(v - W) > 0.10:
                        tgt = jn.index('j_torso')
                        band = 'flank->torso'
                    else:
                        # pauldron rim / couter wing at the deltoid seam — keep the
                        # rigger's arm+torso blend (raising the arm must not tear
                        # the deltoid-pectoral junction).
                        counts['seam-kept'] += 1
                        changed += 1
                        continue
                elif t < 1.0: tgt, band = sh_i, 'shoulder'
                elif t < 1.5: tgt, band = el_i, 'elbow'
                elif t >= 1.9 or np.linalg.norm(v - W) < 0.13:
                    # t>=1.9 (beyond the pivot) OR within 13 cm of the wrist
                    # pivot: the F27 hand graft's finger mass hangs BELOW the
                    # wrist line and projects onto the forearm segment at
                    # t<1.9 — without this override 609 right-hand verts ride
                    # the FOREARM and a 1.7-rad wrist channel would rip the
                    # sword through a fist that refuses to follow it.
                    tgt, band = wr_i, 'wrist'
                else: tgt, band = el_i, 'elbow'
                jts[i] = [tgt, tgt, tgt, tgt]
                wts[i] = [1.0, 0.0, 0.0, 0.0]
                counts[band] += 1
                changed += 1
            report[(name, side)] = counts
            print(f'[{name} {side}] bands: shoulder {counts["shoulder"]}  elbow {counts["elbow"]}  wrist {counts["wrist"]}  flank->torso {counts["flank->torso"]}  seam-kept {counts["seam-kept"]}')

        if changed == 0:
            print(f'[{name}] no arm-dominated vertices — untouched')
            continue

        # ---- write JOINTS_0 / WEIGHTS_0 back into the BIN chunk in place ----
        # JOINTS_0: 4x uint8 = 4 bytes/row; WEIGHTS_0: 4x float32 = 16 bytes/row.
        # (The first version passed comps=1 for WEIGHTS_0 — a 4-byte stride that
        # interleaved every row over the next four: total scramble. Never again.)
        for attr, arr, fmt, row_bytes in (
            ('JOINTS_0', jts.astype(np.uint8), 'B', 4),
            ('WEIGHTS_0', wts.astype(np.float32), 'f', 16),
        ):
            ai = p['attributes'][attr]
            acc = gltf['accessors'][ai]
            bv = gltf['bufferViews'][acc['bufferView']]
            off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
            stride = bv.get('byteStride') or row_bytes
            assert stride == row_bytes, f'{attr}: unexpected interleaved stride {stride}'
            for i in range(n):
                if fmt == 'B':
                    struct.pack_into('<BBBB', buf, off + i*stride,
                                      int(arr[i,0]), int(arr[i,1]), int(arr[i,2]), int(arr[i,3]))
                else:
                    struct.pack_into('<ffff', buf, off + i*stride,
                                      float(arr[i,0]), float(arr[i,1]), float(arr[i,2]), float(arr[i,3]))
        print(f'[{name}] patched {changed} verts in place')

    # ---- write the GLB back: same JSON, patched BIN ----
    json_len, _ = struct.unpack_from('<II', data, 12)
    out = bytearray(data)
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    end = bin_off + 8 + bin_len
    out[bin_off+8:end] = buf
    with open(SRC, 'wb') as f:
        f.write(bytes(out))
    print(f'[written] {SRC} ({len(out)} bytes; backup at {BAK})')

if __name__ == '__main__':
    main()
