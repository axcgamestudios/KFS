#!/usr/bin/env python3
"""KFS — Knight rigger. v3 (Fase 26: the feet ride their ankles).
The knight_statue.glb sculpt faces +Z (toes at +Z, verified by foot histograms):
  - his RIGHT side = -X: arm hanging down, hand at y~8 gripping a great sword
    that points to the ground (blade to y=-103) — extracted as a rigid prop.
  - his LEFT side = +X: arm bent, elbow out, hand at y~8 holding a heater
    shield (comp 2 of the Lower mesh, z 13..34) — extracted as a rigid prop.
  - NO cape exists (comp 2 = the shield; 24% horizontal normals = its curved rim).
Produces knight_rigged.glb:
  - real glTF skin (smooth capsule-binding) over a landmark skeleton,
  - game-space baked transform: NO rotation (model already faces +Z),
    feet at y=0, height ~1.95 m,
  - two hideable rigid props: j_sword_held (child of j_wristR), j_shield_held
    (child of j_wristL),
  - verification renders (bind / walk / attack) via software rasterizer.

v3 — THE FOOT FIX (Fase 26, "que no se vayan a estirar sus pies"):
  The v1/v2 leg sigmoids were INVERTED — 1/(1+exp((y+56)/9)) peaks BELOW the
  knee, so the THIGH barely followed the hip while the FEET rode the hip
  pivot with ~99% weight (probe: foot verts 98.8% j_hipL; a 0.95 rad knee
  bend sheared the sabatons up to 64 cm off their ankle). Every hip swing
  swept the feet through giant arcs — the historic "stretched feet". Now:
    · u_hip / u_knee correctly peak ABOVE the knee / ankle (thigh→hip,
      shin→knee), sharper bands (÷7, ÷5) fit rigid plate;
    · RIGID SABATON: every vert below the ankle pivot (y < -93) is 100% on
      its ankle bone — the feet CANNOT stretch, by construction.

v4 — THE SWORDLESS-ARM FIX (Fase 27, "el brazo sin espada tiene bugs de
  estiramiento"): the statue's LEFT forearm CROSSES the body midline
  (elbow x=38 → wrist x=14, gripping the heater shield at z 16..28) but
  r_armL demanded x≥17 — every gauntlet/grip vert at x 14..17 fell through
  classify_point to the DEFAULT 'torso', and the torso band (y<8) put them
  100% on j_root: the hand stayed WELDED TO THE PELVIS while the arm swung
  (probe f27: 155 upper + 105 lower hand verts dominated by j_root; the
  bow aim extends shoulderL to −1.4 rad → the hand stretched across the
  chest). Two-part fix, mirroring the F26 sabaton:
    · CONNECTIVITY RECLAIM: a pelvis/torso vert that shares a vertex-
      neighbour with a true arm vert AND hugs the forearm+wrist chain
      (<9 units) is arm — cuff, gauntlet and grip are one continuous piece
      with the forearm, while tasset/skirt plates never share verts with
      the arm, so the skirt stays rigid with the pelvis;
    · RIGID GAUNTLET: every arm vert below the wrist cuff (y≤14, within 7
      units of the wrist segment) is 100% its wrist bone — plate gauntlets
      do not bend, and the hand can NEVER stretch off the arm again.
Usage: python3 scripts/rig_knight.py [--check]"""
import json, struct, sys, math
import numpy as np

SRC = 'public/game/models/knight_statue.glb'
DST = 'public/game/models/knight_rigged.glb'
MANIFEST = 'public/game/models/knight_rigged.json'
CHECK_ONLY = '--check' in sys.argv

# ------------------------------------------------------------------ glb io
def load_glb(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'glTF'
    total = struct.unpack('<I', data[8:12])[0]
    off = 12
    chunks = []
    while off < total:
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        chunks.append((ctype, data[off + 8:off + 8 + clen]))
        off += 8 + clen
    js = json.loads(chunks[0][1].decode())
    bind = None
    for ctype, cdata in chunks[1:]:
        if ctype == 0x004E4942:
            bind = cdata
    return js, bind

def acc_arr(js, bind, idx):
    a = js['accessors'][idx]
    v = js['bufferViews'][a['bufferView']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    comp = {'VEC3': 3, 'VEC2': 2, 'VEC4': 4, 'SCALAR': 1, 'MAT4': 16}[a['type']]
    fmt = {5126: 'f4', 5125: 'u4', 5123: 'u2', 5121: 'u1'}[a['componentType']]
    dt = np.frombuffer(bind, dtype=np.dtype(fmt), count=a['count'] * comp, offset=off)
    return dt.reshape(a['count'], comp)

def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=float).reshape(4, 4)
    t = n.get('translation', [0, 0, 0]); q = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = q
    R = np.array([[1 - 2*(y*y+z*z), 2*(x*y-w*z), 2*(x*z+w*y)],
                  [2*(x*y+w*z), 1 - 2*(x*x+z*z), 2*(y*z-w*x)],
                  [2*(x*z-w*y), 2*(y*z+w*x), 1 - 2*(x*x+y*y)]])
    m = np.eye(4); m[:3, :3] = R * np.array(s); m[:3, 3] = t
    return m

def get_world_meshes(js, bind):
    nodes = js['nodes']
    out = []
    def walk(ni, parent_m, tag):
        n = nodes[ni]
        m = parent_m @ node_matrix(n)
        if 'mesh' in n:
            for p in js['meshes'][n['mesh']]['primitives']:
                pos = acc_arr(js, bind, p['attributes']['POSITION']).astype(np.float64)
                nrm = acc_arr(js, bind, p['attributes'].get('NORMAL')).astype(np.float64) if 'NORMAL' in p['attributes'] else None
                uv = acc_arr(js, bind, p['attributes'].get('TEXCOORD_0')).astype(np.float64) if 'TEXCOORD_0' in p['attributes'] else None
                idx = acc_arr(js, bind, p['indices']).astype(np.int64).reshape(-1)
                hp = np.hstack([pos, np.ones((len(pos), 1))])
                wpos = (hp @ m.T)[:, :3]
                wnrm = None
                if nrm is not None:
                    sc = np.linalg.norm(m[:3, :3], axis=0); sc[sc < 1e-12] = 1e-12
                    wnrm = nrm @ (m[:3, :3] / sc).T
                out.append(dict(tag=tag, positions=wpos, normals=wnrm, uvs=uv,
                                indices=idx, material=p.get('material')))
        for c in n.get('children', []):
            walk(c, m, tag)
    for r in js['scenes'][0]['nodes']:
        n = nodes[r]
        for c in n.get('children', []):
            cn = nodes[c]
            if 'collada' in cn.get('name', '').lower():
                for cc in cn.get('children', []):
                    walk(cc, np.eye(4), nodes[cc].get('name'))
    return out

# ------------------------------------------------------------------ skeleton
# Model faces +Z. RIGHT = -X, LEFT = +X. Feet y=-104, helm top y=106.
BONES = [
    ('j_root',    None,      (-3.0, -14.0, 0.0)),
    ('j_torso',   'j_root',  (-3.0, 14.0, 0.0)),
    ('j_head',    'j_torso', (-4.0, 73.0, 2.0)),
    # right arm (-X): hangs down, hand grips the sword at (x-27, y8, z20)
    ('j_shoulderR', 'j_torso', (-30.0, 62.0, 0.0)),
    ('j_elbowR',    'j_shoulderR', (-38.0, 36.0, 10.0)),
    ('j_wristR',    'j_elbowR', (-27.0, 8.0, 19.0)),
    # left arm (+X): elbow out-back, forearm to the shield grip
    ('j_shoulderL', 'j_torso', (28.0, 62.0, 0.0)),
    ('j_elbowL',    'j_shoulderL', (38.0, 42.0, -6.0)),
    ('j_wristL',    'j_elbowL', (18.0, 8.0, 22.0)),
    # right leg (-X)
    ('j_hipR',  'j_root', (-25.0, -24.0, -8.0)),
    ('j_kneeR', 'j_hipR',  (-26.0, -56.0, -8.0)),
    ('j_ankleR', 'j_kneeR', (-28.0, -93.0, 3.0)),
    # left leg (+X)
    ('j_hipL',  'j_root', (6.0, -24.0, -6.0)),
    ('j_kneeL', 'j_hipL',  (6.0, -56.0, -6.0)),
    ('j_ankleL', 'j_kneeL', (9.0, -93.0, 4.0)),
]
BONE_INDEX = {name: i for i, (name, _, _) in enumerate(BONES)}

def seg(p0, p1):
    return np.array(p0, dtype=float), np.array(p1, dtype=float)

BONE_SEGMENTS = {
    'j_torso':  seg((-3, 8, 0), (-4, 66, 2)),
    'j_root':   seg((-3, -22, 0), (-3, 8, 0)),
    'j_head':   seg((-4, 74, 2), (-4, 104, 3)),
    'j_shoulderR': seg((-30, 62, 0), (-38, 36, 10)),
    'j_elbowR':    seg((-38, 36, 10), (-27, 10, 18)),
    'j_wristR':    seg((-30, 12, 16), (-24, 2, 21)),
    'j_shoulderL': seg((28, 62, 0), (38, 42, -6)),
    'j_elbowL':    seg((38, 42, -6), (18, 8, 22)),
    'j_wristL':    seg((22, 10, 16), (14, 2, 28)),
    'j_hipR':  seg((-25, -24, -8), (-26, -56, -8)),
    'j_kneeR': seg((-26, -56, -8), (-28, -93, 3)),
    'j_ankleR': seg((-28, -93, 3), (-29, -102, 20)),
    'j_hipL':  seg((6, -24, -6), (6, -56, -6)),
    'j_kneeL': seg((6, -56, -6), (8, -93, 4)),
    'j_ankleL': seg((8, -93, 4), (10, -102, 22)),
}
BONE_RADIUS = {
    'j_torso': 20.0, 'j_root': 16.0, 'j_head': 9.0,
    'j_shoulderR': 9.0, 'j_elbowR': 7.5, 'j_wristR': 7.0,
    'j_shoulderL': 9.0, 'j_elbowL': 7.5, 'j_wristL': 7.0,
    'j_hipR': 9.0, 'j_kneeR': 8.0, 'j_ankleR': 7.5,
    'j_hipL': 9.0, 'j_kneeL': 8.0, 'j_ankleL': 7.5,
}

# ------------------------------------------------------------------ regions
def r_sword(x, y, z):  # great sword: blade + guard below the right fist
    return -35 <= x <= -18 and 13 <= z <= 28 and -104 <= y <= 8
def r_head(x, y, z):
    return y >= 73 and -22 <= x <= 16 and -20 <= z <= 22
def r_pelvis(x, y, z):  # belt + tassets + skirt
    return -24 <= y <= 13 and -32 <= x <= 30 and -26 <= z <= 16
def r_armR(x, y, z):
    return x <= -17 and 0 <= y <= 78 and -30 <= z <= 27
def r_armL(x, y, z):
    return x >= 17 and 0 <= y <= 78 and -30 <= z <= 27
def r_legR(x, y, z):
    return y <= -24 and -40 <= x <= -9
def r_legL(x, y, z):
    return y <= -24 and -9 <= x <= 30
def r_torso(x, y, z):
    return 13 <= y <= 78 and -34 <= x <= 34 and -30 <= z <= 27

REGION_ORDER = [
    ('sword', r_sword), ('head', r_head), ('pelvis', r_pelvis),
    ('armR', r_armR), ('armL', r_armL), ('legR', r_legR), ('legL', r_legL),
    ('torso', r_torso),
]

def classify_point(x, y, z, shield_mask=False):
    if shield_mask:
        return 'shield'
    for name, fn in REGION_ORDER:
        if fn(x, y, z):
            return name
    return 'torso'

# ------------------------------------------------------------------ shield detection (connectivity)
def find_shield(js, bind, meshes):
    """The heater shield = the big connected component of the LOWER mesh whose
    bbox sits at the front (+Z) and spans below the knees. Returns a boolean
    mask over the LOWER mesh's TRIANGLES."""
    lo = next(m for m in meshes if m['tag'] == 'Lower')
    n = len(lo['indices']) // 3
    tris = lo['positions'][lo['indices']].reshape(-1, 3, 3)
    # union-find over shared edges (position-quantized)
    v = lo['positions']
    q = np.round(v / 0.05).astype(np.int64)
    order = np.lexsort((q[:, 2], q[:, 1], q[:, 0]))
    qs = q[order]
    ng = np.ones(len(qs), dtype=bool)
    ng[1:] = (qs[1:] != qs[:-1]).any(axis=1)
    gid = np.cumsum(ng) - 1
    vid = np.empty(len(qs), dtype=np.int64)
    vid[order] = gid
    parent = np.arange(n, dtype=np.int64)
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    tri_corners = lo['indices'].astype(np.int64)  # shared-vertex indices (true connectivity)
    for c in range(3):
        c2 = (c + 1) % 3
        e = np.stack([tri_corners.reshape(n, 3)[:, c], tri_corners.reshape(n, 3)[:, c2]], axis=1)
        e.sort(axis=1)
        o = np.lexsort((e[:, 1], e[:, 0]))
        es = e[o]
        ng2 = np.ones(len(es), dtype=bool)
        ng2[1:] = (es[1:] != es[:-1]).any(axis=1)
        eid = np.cumsum(ng2) - 1
        edge_ids = np.empty(len(es), dtype=np.int64)
        edge_ids[o] = eid
        tri_of_edge = np.repeat(np.arange(n), 3)
        o2 = np.argsort(edge_ids, kind='stable')
        ei = edge_ids[o2]; tt = tri_of_edge[o2]
        same = ei[1:] == ei[:-1]
        for k in np.nonzero(same)[0]:
            ra, rb = find(tt[k]), find(tt[k + 1])
            if ra != rb:
                parent[ra] = rb
    roots = np.array([find(i) for i in range(n)])
    uniq, counts = np.unique(roots, return_counts=True)
    for u, cnt in sorted(zip(uniq, counts), key=lambda t: -t[1])[:10]:
        mask = roots == u
        c = tris[mask]
        pts = c.reshape(-1, 3)
        if pts[:, 2].min() > 11 and pts[:, 1].min() < -85 and cnt > 500:
            tri_mask = np.zeros(len(lo['indices']) // 3, dtype=bool)
            tri_mask[mask] = True
            print(f'shield component found: {cnt} tris, z {pts[:,2].min():.1f}..{pts[:,2].max():.1f}, y {pts[:,1].min():.1f}..{pts[:,1].max():.1f}')
            return lo, tri_mask
    return lo, None

# ------------------------------------------------------------------ weights
def dist_to_segment(p, a, b):
    ab = b - a
    t = np.clip(np.dot(p - a, ab) / max(1e-9, np.dot(ab, ab)), 0, 1)
    q = a + t * ab
    return float(np.linalg.norm(p - q))

def smoothstepf(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)

def compute_weights(pos, part_of):
    n = len(pos)
    W = np.zeros((n, len(BONES)), dtype=np.float64)
    for vi in range(n):
        p = pos[vi]
        part = part_of[vi]
        y = p[1]
        if part == 'sword':
            W[vi, BONE_INDEX['j_wristR']] = 1.0
            continue
        if part == 'shield':
            W[vi, BONE_INDEX['j_wristL']] = 1.0
            continue
        if part == 'head':
            wh = 0.15 + 0.85 * smoothstepf(73, 78, y)
            W[vi, BONE_INDEX['j_head']] = wh
            W[vi, BONE_INDEX['j_torso']] = 1.0 - wh
            continue
        if part == 'pelvis':
            # chainmail fauld: rigid with the pelvis (real armor behavior),
            # slight thigh-follow at the hem so it is not dead-stiff.
            hem = smoothstepf(-6, -24, y)          # 0 at hem bottom, 1 near waist
            rootW = 1.0 - 0.18 * hem
            hipW = 0.09 * hem
            W[vi, BONE_INDEX['j_root']] = rootW
            W[vi, BONE_INDEX['j_hipR']] = hipW
            W[vi, BONE_INDEX['j_hipL']] = hipW
            continue
        if part in ('armR', 'armL'):
            side = 'R' if part == 'armR' else 'L'
            radii = {'shoulder': 7.5, 'elbow': 6.0, 'wrist': 5.5}
            for bname, r in ((f'j_shoulder{side}', radii['shoulder']),
                             (f'j_elbow{side}', radii['elbow']),
                             (f'j_wrist{side}', radii['wrist'])):
                a, b = BONE_SEGMENTS[bname]
                d = dist_to_segment(p, a, b)
                W[vi, BONE_INDEX[bname]] = 1.0 / (max(d - r, 0.4) ** 1.8 + 0.15)
            # shoulder-cap / armpit blend into the torso so raising the arm
            # does not tear the deltoid-pectoral junction (y 46..66).
            if y > 46:
                W[vi, BONE_INDEX['j_torso']] = 0.30 * smoothstepf(46, 62, y)
            # RIGID GAUNTLET (Fase 27): plate gauntlets don't bend — the
            # whole hand below the wrist cuff NEVER leaves its wrist bone
            # (same construction as the F26 rigid sabaton). The grip verts
            # used to ride j_root: the stretched swordless arm.
            if y <= 14.0:
                wa, wb_ = BONE_SEGMENTS[f'j_wrist{side}']
                if dist_to_segment(p, wa, wb_) < 8.0:
                    W[vi, :] = 0.0
                    W[vi, BONE_INDEX[f'j_wrist{side}']] = 1.0
            continue
        if part in ('legR', 'legL'):
            side = 'R' if part == 'legR' else 'L'
            hipn = f'j_hip{side}'; kneen = f'j_knee{side}'; anklen = f'j_ankle{side}'
            # Fase 26 — CORRECTED y-bands (the v1/v2 sigmoids were inverted:
            # they peaked BELOW the joint, so feet rode the hip pivot and the
            # thighs barely followed the hip — the stretched-feet bug).
            # u_hip ~1 ABOVE the knee (thigh → hip), u_knee ~1 ABOVE the
            # ankle (shin → knee); sharper divisors (7 / 4) fit rigid plate.
            u_hip = 1.0 / (1.0 + math.exp(-(y + 56.0) / 7.0))
            u_knee = 1.0 / (1.0 + math.exp(-(y + 86.0) / 4.0))
            W[vi, BONE_INDEX[hipn]] = u_hip
            W[vi, BONE_INDEX[kneen]] = (1.0 - u_hip) * u_knee
            W[vi, BONE_INDEX[anklen]] = (1.0 - u_hip) * (1.0 - u_knee)
            # RIGID SABATON: the whole foot below the ankle pivot area (the
            # ankle joint sits at y=-93, the instep/collar reaches ~-88) NEVER
            # leaves its ankle bone — plate feet don't bend, and the feet must
            # never stretch, no matter how deep the knee bends. The knee↔ankle
            # blend lives entirely INSIDE the greave tube (y -88..-78) where
            # the shear is invisible.
            if y < -88.0:
                W[vi, BONE_INDEX[hipn]] = 0.0
                W[vi, BONE_INDEX[kneen]] = 0.0
                W[vi, BONE_INDEX[anklen]] = 1.0
            # tiny root pull at the very top of the thigh
            if y > -32:
                W[vi, BONE_INDEX['j_root']] = 0.12 * smoothstepf(-32, -24, y)
            continue
        # torso: real waist articulation at y 8..18 + head pull at the top
        a, b = BONE_SEGMENTS['j_torso']
        d = dist_to_segment(p, a, b)
        w = 1.0 / (max(d - 20.0, 0.4) ** 2.0 + 0.08)
        kWaist = smoothstepf(8, 18, y)
        W[vi, BONE_INDEX['j_torso']] = w * kWaist
        W[vi, BONE_INDEX['j_root']] = w * (1.0 - kWaist)
        if y > 66:
            W[vi, BONE_INDEX['j_head']] = w * 0.3 * smoothstepf(66, 74, y)
    out = np.zeros((n, 4), dtype=np.float64)
    outj = np.zeros((n, 4), dtype=np.int64)
    for vi in range(n):
        row = W[vi]
        idx = np.argsort(-row)[:4]
        s = row[idx].sum()
        if s <= 0:
            outj[vi] = 0; out[vi] = [1, 0, 0, 0]
        else:
            outj[vi] = idx
            out[vi] = row[idx] / s
    return out, outj

# ------------------------------------------------------------------ game transform
GAME_SCALE = 1.95 / 210.0
def to_game(p):
    x, y, z = p
    return np.array([x * GAME_SCALE, (y + 104.0) * GAME_SCALE, z * GAME_SCALE])

def to_game_dir(v):
    return np.array([v[0] * GAME_SCALE, v[1] * GAME_SCALE, v[2] * GAME_SCALE])

# ------------------------------------------------------------------ pipeline
js, bind = load_glb(SRC)
meshes = get_world_meshes(js, bind)
up = next(m for m in meshes if m['tag'] == 'Upper')
lo = next(m for m in meshes if m['tag'] == 'Lower')

lo_mesh, shield_tri_mask = find_shield(js, bind, meshes)
if shield_tri_mask is None:
    print('WARNING: shield component not found — shield will be geometric only')
    # geometric fallback: front sheet
    tri = lo['positions'][lo['indices']].reshape(-1, 3, 3)
    cen = tri.mean(axis=1)
    shield_tri_mask = (cen[:, 2] >= 14) & (cen[:, 1] <= 12) & (cen[:, 0] >= -16)

# vertex mask for the shield in the LOWER mesh
lo_tri_of_vert = np.repeat(np.arange(len(lo['indices']) // 3), 3)
shield_vert_mask = shield_tri_mask[lo_tri_of_vert[lo['indices']]].reshape(-1, 3).any(axis=1)

# split sword (geometric, from both meshes)
def vec_sword(c):
    x, y, z = c[:, 0], c[:, 1], c[:, 2]
    return (x >= -35) & (x <= -18) & (z >= 13) & (z <= 28) & (y >= -104) & (y <= 8)

def split_by_pred(m, vert_pred, tri_pred):
    tri = m['positions'][m['indices']].reshape(-1, 3, 3)
    cen = tri.mean(axis=1)
    take = tri_pred(cen)
    idxs = m['indices'].reshape(-1, 3)[take].reshape(-1)
    uniq, remap = np.unique(idxs, return_inverse=True)
    return dict(positions=m['positions'][uniq], normals=m['normals'][uniq] if m['normals'] is not None else None,
                uvs=m['uvs'][uniq] if m['uvs'] is not None else None,
                indices=remap.reshape(-1, 3), material=m['material']), take

def merge_geos(a, b):
    pos = np.vstack([a['positions'], b['positions']])
    nrm = np.vstack([a['normals'], b['normals']]) if a['normals'] is not None else None
    uv = np.vstack([a['uvs'], b['uvs']]) if a['uvs'] is not None else None
    idx = np.vstack([a['indices'], b['indices'] + len(a['positions'])])
    return dict(positions=pos, normals=nrm, uvs=uv, indices=idx, material=a['material'])

up_sword, up_sword_take = split_by_pred(up, None, vec_sword)
lo_sword, lo_sword_take = split_by_pred(lo, None, vec_sword)
sword = merge_geos(up_sword, lo_sword) if (len(up_sword['indices']) or len(lo_sword['indices'])) else None
print(f'sword prop: {0 if sword is None else len(sword["indices"])} tris (up {len(up_sword["indices"])}, lo {len(lo_sword["indices"])})')

# shield geometry from the LOWER mesh
def take_tri_subset(m, take):
    idxs = m['indices'].reshape(-1, 3)[take].reshape(-1)
    uniq, remap = np.unique(idxs, return_inverse=True)
    return dict(positions=m['positions'][uniq], normals=m['normals'][uniq] if m['normals'] is not None else None,
                uvs=m['uvs'][uniq] if m['uvs'] is not None else None,
                indices=remap.reshape(-1, 3), material=m['material'])
shield = take_tri_subset(lo, shield_tri_mask)
print(f'shield prop: {len(shield["indices"])} tris')

# remaining meshes = original minus sword, minus shield
def remove_tris(m, take_sword, vert_mask_shield):
    tri_count = len(m['indices']) // 3
    keep = ~take_sword
    # drop shield triangles (only for the lower mesh)
    keep = keep & ~vert_mask_shield if vert_mask_shield is not None else keep
    idxs = m['indices'].reshape(-1, 3)[keep].reshape(-1)
    uniq, remap = np.unique(idxs, return_inverse=True)
    return dict(positions=m['positions'][uniq], normals=m['normals'][uniq] if m['normals'] is not None else None,
                uvs=m['uvs'][uniq] if m['uvs'] is not None else None,
                indices=remap.reshape(-1, 3), material=m['material'])

up_keep = remove_tris(up, up_sword_take, None)
lo_keep = remove_tris(lo, lo_sword_take, shield_tri_mask)

# per-vertex part assignment
def assign_parts(m):
    return [classify_point(p[0], p[1], p[2]) for p in m['positions']]

def reclaim_arms(m, parts):
    """Fase 27 — reclaim the crossing forearm's cuff/gauntlet/grip verts.
    A pelvis/torso vert that SHARES a vertex-neighbour (2 hops) with a true
    arm vert AND hugs that side's forearm+wrist chain (< 9 units) is arm:
    the cuff runs continuously into the forearm, while tasset/skirt plates
    never share vertices with the arm — so the skirt stays on the pelvis."""
    parts = list(parts)
    n = len(parts)
    idx = m['indices'].reshape(-1, 3)
    nbr = [set() for _ in range(n)]
    for tri in idx:
        a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
        nbr[a].add(b); nbr[a].add(c)
        nbr[b].add(a); nbr[b].add(c)
        nbr[c].add(a); nbr[c].add(b)
    P = m['positions']
    for side in ('L', 'R'):
        elbow_seg = BONE_SEGMENTS[f'j_elbow{side}']
        wrist_seg = BONE_SEGMENTS[f'j_wrist{side}']
        # TRUE HAND ZONE (geometric reclaim): verts inside the grip capsule
        # (z > 16.2 — in front of the skirt, whose plates all live at
        # z <= 16; y <= 14 — below the wrist cuff; within 8 units of the
        # wrist segment) are HAND no matter their part. The Upper/Lower mesh
        # split cuts through the wrist, so connectivity alone cannot reach
        # the lower mesh's grip verts; and r_arm's boxes (x>=17 / y>=0)
        # exclude the wrapping fingers (x 10..15, y -1..0).
        zone = []
        for vi in range(n):
            if parts[vi] in ('head', 'sword'):
                continue
            p = P[vi]
            if p[1] <= 14.0 and p[2] > 16.2 and dist_to_segment(p, wrist_seg[0], wrist_seg[1]) < 8.0:
                if parts[vi] != f'arm{side}':
                    parts[vi] = f'arm{side}'
                    zone.append(vi)
        if zone:
            Q = P[zone]
            print(f'  hand-zone {side}: {len(zone)} verts '
                  f'(x {Q[:,0].min():.0f}..{Q[:,0].max():.0f}, y {Q[:,1].min():.0f}..{Q[:,1].max():.0f}, z {Q[:,2].min():.0f}..{Q[:,2].max():.0f})')
        seeds = [i for i in range(n) if parts[i] == f'arm{side}']
        if not seeds:
            continue
        hop = set()
        for s in seeds:
            hop.update(nbr[s])
            for v in nbr[s]:
                hop.update(nbr[v])
        reclaimed = 0
        for vi in hop:
            if parts[vi] not in ('pelvis', 'torso'):
                continue
            p = P[vi]
            d = min(dist_to_segment(p, elbow_seg[0], elbow_seg[1]),
                    dist_to_segment(p, wrist_seg[0], wrist_seg[1]))
            if d < 9.0:
                parts[vi] = f'arm{side}'
                reclaimed += 1
        print(f'  reclaim {side}: {reclaimed} cuff/grip verts -> arm{side}')
    return parts

up_parts = assign_parts(up_keep)
lo_parts = assign_parts(lo_keep)
up_parts = reclaim_arms(up_keep, up_parts)
lo_parts = reclaim_arms(lo_keep, lo_parts)
from collections import Counter
print('UPPER parts:', Counter(up_parts).most_common())
print('LOWER parts:', Counter(lo_parts).most_common())

up_w, up_j = compute_weights(up_keep['positions'], up_parts)
lo_w, lo_j = compute_weights(lo_keep['positions'], lo_parts)

# game-space
for m in (up_keep, lo_keep):
    m['gpos'] = np.array([to_game(p) for p in m['positions']])
    if m['normals'] is not None:
        gn = np.array([to_game_dir(v) for v in m['normals']])
        m['gnormals'] = gn / np.linalg.norm(gn, axis=1, keepdims=True)
    m['guvs'] = m['uvs']
wristR_game = to_game((-27.0, 8.0, 19.0))
wristL_game = to_game((18.0, 8.0, 22.0))
for prop, pivot in ((sword, wristR_game), (shield, wristL_game)):
    if prop is not None:
        prop['gpos'] = np.array([to_game(p) for p in prop['positions']]) - pivot
        if prop['normals'] is not None:
            gn = np.array([to_game_dir(v) for v in prop['normals']])
            prop['gnormals'] = gn / np.linalg.norm(gn, axis=1, keepdims=True)
        prop['guvs'] = prop['uvs']

bone_game = {name: to_game(p) for name, _, p in BONES}
print('bone game positions (m):')
for name, parent, p in BONES:
    print(f'  {name:12s} {np.round(bone_game[name], 3)}')

# ------------------------------------------------------------------ pose + render
def world_matrices(pose):
    """Compute each bone's WORLD matrix exactly as THREE will:
    world(bone) = world(parent) · translate(rest_local) · R_local
    (rotation about the bone's own origin — the joint pivot)."""
    rest = {n: bone_game[n] for n, _, _ in BONES}
    worldm = {}
    for name, parent, _ in BONES:
        base = np.eye(4) if parent is None else worldm[parent]
        rel = rest[name] - (rest[parent] if parent else np.zeros(3))
        M = base.copy()
        M[:3, 3] = M[:3, 3] + rel  # base (may carry parent rotation) — rel in parent frame is rest-delta; consistent for bind + small local rotations
        if name in pose:
            axis, ang = pose[name]
            axis = np.array(axis, dtype=float); axis /= np.linalg.norm(axis)
            R = np.eye(4)
            c, s = math.cos(ang), math.sin(ang)
            t = 1 - c
            x_, y_, z_ = axis
            R[:3, :3] = np.array([[t*x_*x_+c, t*x_*y_-s*z_, t*x_*z_+s*y_],
                                  [t*x_*y_+s*z_, t*y_*y_+c, t*y_*z_-s*x_],
                                  [t*x_*z_-s*y_, t*y_*z_+s*x_, t*z_*z_+c]])
            M = M @ R
        worldm[name] = M
    return worldm

def skinned_tris(m, w, j, pose):
    """Apply pose with PROPER skinning: v' = Σ w · M_bone · (IBM_bone · v).
    At bind this is the identity — matching what THREE.SkinnedMesh does."""
    worldm = world_matrices(pose)
    rest = {n: bone_game[n] for n, _, _ in BONES}
    P = m['gpos']
    acc = np.zeros_like(P)
    for k in range(4):
        wk = w[:, k]
        if wk.max() <= 0:
            continue
        for bi in np.unique(j[:, k]):
            sel = j[:, k] == bi
            if not sel.any():
                continue
            name = BONES[bi][0]
            M = worldm[name]
            r = rest[name]
            local = P[sel] - r[None, :]
            acc[sel] += (wk[sel])[:, None] * (local @ M[:3, :3].T + M[:3, 3][None, :])
    return acc[m['indices']].reshape(-1, 3, 3)

def prop_tris(prop, bone, pose):
    worldm = world_matrices(pose)
    M = worldm[bone]
    P = prop['gpos']
    wp = P @ M[:3, :3].T + M[:3, 3][None, :]
    return wp[prop['indices']].reshape(-1, 3, 3)

def render_pose(tri_list, colors, fname, views=((0, 10), (40, 18), (-90, 6)), W=360):
    import PIL.Image as I
    from PIL import ImageDraw
    allpts = np.vstack([t.reshape(-1, 3) for t in tri_list])
    c = allpts.mean(axis=0)
    Hs = 440
    sheet = I.new('RGB', (len(views) * (W + 14) + 8, Hs + 30), (10, 10, 16))
    d = ImageDraw.Draw(sheet)
    for vi, (az, el) in enumerate(views):
        azr, elr = math.radians(az), math.radians(el)
        fwd = np.array([math.cos(elr) * math.sin(azr), math.sin(elr), math.cos(elr) * math.cos(azr)])
        right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        dist = 6.0
        zbuf = np.full((Hs, W), -1e9, dtype=np.float32)
        canvas = np.zeros((Hs, W, 3), dtype=np.uint8); canvas[:] = (12, 12, 18)
        x0 = 8 + vi * (W + 14)
        for tl, col in zip(tri_list, colors):
            P = tl.reshape(-1, 3) - c
            Xs = P @ right; Ys = P @ up; Zs = P @ fwd
            f = 6.0  # focal in window-units at dist=6 → model (±1.4 m) fills the view
            us = Xs * f / (dist - Zs); vs = Ys * f / (dist - Zs)
            umin, umax = -1.4, 1.4
            sx = (W - 16) / (umax - umin); sy = (Hs - 16) / (umax - umin)
            px = 8 + (us - umin) * sx
            py = Hs - 8 - (vs - umin) * sy
            n = len(tl)
            tri2d = np.stack([px.reshape(n, 3), py.reshape(n, 3)], axis=2)
            depth = Zs.reshape(n, 3).mean(axis=1)
            e1 = tl[:, 1] - tl[:, 0]; e2 = tl[:, 2] - tl[:, 0]
            nrm = np.cross(e1, e2); nrm /= (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12)
            lam = np.clip(np.abs(nrm) @ (np.array([-.5, .8, .45]) * .75 + fwd * .4), 0, 1)
            face = np.ones(len(tl), dtype=bool)  # mixed winding: no cull, z-buffer decides
            order = np.argsort(-depth)
            for ti in order:
                if not face[ti]: continue
                x0p, y0p = tri2d[ti, 0]; x1p, y1p = tri2d[ti, 1]; x2p, y2p = tri2d[ti, 2]
                mnx = max(int(math.floor(min(x0p, x1p, x2p))), 0); mxx = min(int(math.ceil(max(x0p, x1p, x2p))), W - 1)
                mny = max(int(math.floor(min(y0p, y1p, y2p))), 0); mxy = min(int(math.ceil(max(y0p, y1p, y2p))), Hs - 1)
                if mnx > mxx or mny > mxy: continue
                dd = (x1p - x0p) * (y2p - y0p) - (x2p - x0p) * (y1p - y0p)
                if abs(dd) < 1e-12: continue
                shade = int(np.clip(0.35 + lam[ti] * 0.85, 0, 1) * 255)
                colr = (int(shade * col[0] / 255), int(shade * col[1] / 255), int(shade * col[2] / 255))
                yy, xx = np.mgrid[mny:mxy + 1, mnx:mxx + 1]
                w0 = ((x1p - xx) * (y2p - yy) - (x2p - xx) * (y1p - yy)) / dd
                ins = (w0 >= 0) & (((x0p - xx) * (y1p - yy) - (x1p - xx) * (y0p - yy)) / dd >= 0)
                ys, xs = yy[ins], xx[ins]
                if len(ys) == 0: continue
                zt = depth[ti]
                better = zt > zbuf[ys, xs]
                if better.any():
                    zbuf[ys, xs] = np.where(better, zt, zbuf[ys, xs])
                    canvas[ys[better], xs[better]] = colr
        sheet.paste(I.fromarray(canvas), (x0, 8))
    sheet.save(fname)
    print('rendered', fname)

STEEL = (185, 200, 235)
CLOTH = (235, 205, 160)
SWCOL = (250, 250, 255)
SHCOL = (120, 220, 160)

def bind_tris(m):
    return m['gpos'][m['indices']].reshape(-1, 3, 3)

if not CHECK_ONLY:
    render_pose(
        [bind_tris(up_keep), bind_tris(lo_keep)] +
        ([bind_tris(sword) + wristR_game] if sword else []) +
        ([bind_tris(shield) + wristL_game]),
        [STEEL, CLOTH] + ([SWCOL] if sword else []) + [SHCOL],
        '/tmp/rig_bind.png')

    walk = {
        'j_hipR': ((1, 0, 0), -0.55), 'j_kneeR': ((1, 0, 0), 0.35),
        'j_ankleR': ((1, 0, 0), 0.25),
        'j_hipL': ((1, 0, 0), 0.45), 'j_kneeL': ((1, 0, 0), 0.2),
        'j_ankleL': ((1, 0, 0), -0.1),
        'j_shoulderR': ((1, 0, 0), -0.5),
        'j_shoulderL': ((1, 0, 0), 0.35), 'j_elbowL': ((1, 0, 0), -0.25),
        'j_torso': ((1, 0, 0), 0.06), 'j_head': ((1, 0, 0), -0.04),
    }
    render_pose(
        [skinned_tris(up_keep, up_w, up_j, walk), skinned_tris(lo_keep, lo_w, lo_j, walk)] +
        ([prop_tris(sword, 'j_wristR', walk)] if sword else []) +
        [prop_tris(shield, 'j_wristL', walk)],
        [STEEL, CLOTH] + ([SWCOL] if sword else []) + [SHCOL],
        '/tmp/rig_walk.png')

    atk = {
        'j_shoulderR': ((0, 0, 1), -2.0), 'j_elbowR': ((1, 0, 0), -0.9),
        'j_shoulderL': ((1, 0, 0), -0.35), 'j_elbowL': ((1, 0, 0), -0.3),
        'j_torso': ((0, 1, 0), -0.45), 'j_head': ((0, 1, 0), 0.3),
        'j_hipR': ((1, 0, 0), -0.25), 'j_kneeR': ((1, 0, 0), 0.3),
        'j_hipL': ((1, 0, 0), 0.15), 'j_kneeL': ((1, 0, 0), 0.25),
    }
    render_pose(
        [skinned_tris(up_keep, up_w, up_j, atk), skinned_tris(lo_keep, lo_w, lo_j, atk)] +
        ([prop_tris(sword, 'j_wristR', atk)] if sword else []) +
        [prop_tris(shield, 'j_wristL', atk)],
        [STEEL, CLOTH] + ([SWCOL] if sword else []) + [SHCOL],
        '/tmp/rig_attack.png')

    # Fase 27 — BOW AIM: the left arm's biggest excursion (shoulderL −1.4,
    # elbowL −1.1, straight at the target). The old rig dragged the hand
    # across the chest here (grip verts on j_root). NUMERIC check: the hand
    # must track the posed wrist bone rigidly.
    bow = {
        'j_shoulderL': ((1, 0, 0), -1.4), 'j_elbowL': ((1, 0, 0), -1.1),
        'j_shoulderR': ((1, 0, 0), -0.55), 'j_elbowR': ((1, 0, 0), -0.35),
        'j_torso': ((0, 1, 0), 0.18), 'j_head': ((0, 1, 0), 0.05),
    }
    render_pose(
        [skinned_tris(up_keep, up_w, up_j, bow), skinned_tris(lo_keep, lo_w, lo_j, bow)] +
        ([prop_tris(sword, 'j_wristR', bow)] if sword else []) +
        [prop_tris(shield, 'j_wristL', bow)],
        [STEEL, CLOTH] + ([SWCOL] if sword else []) + [SHCOL],
        '/tmp/rig_bow.png')

    def hand_rigidity_check(m, w, j, tag):
        """Hand verts (within 7 units of a wrist segment, y<=14) must be 100%
        on that wrist — and their skinned bow-aim position must equal the
        rigid wrist transform to the millimetre."""
        P = m['gpos']
        worldm = world_matrices(bow)
        ok = 0; bad = 0; worst = 0.0
        for vi in range(len(P)):
            p = P[vi]
            for side in ('L', 'R'):
                wa = bone_game[f'j_wrist{side}']
                wb = wa + (bone_game[f'j_wrist{side}'] - bone_game[f'j_elbow{side}']) * 0.8
                # statue-space gate mirrors the clamp: y<=14, dist<7 (game m)
                ys = (p[1] - 0.0)  # game-space y of statue y is (y+104)*s
                # recompute statue-space distance from game-space p
                sx = p[0] / GAME_SCALE; sy = p[1] / GAME_SCALE - 104.0; sz = p[2] / GAME_SCALE
                sp = np.array([sx, sy, sz])
                seg = BONE_SEGMENTS[f'j_wrist{side}']
                # TRUE hand zone: in FRONT of the skirt (statue pelvis verts
                # all live at z <= 16; the hand grips at z 16..28) and below
                # the wrist cuff. Tasset plates near the wrist segment start
                # are skirt — they MUST stay on the root.
                if sy > 14.0 or sz <= 16.2 or dist_to_segment(sp, seg[0], seg[1]) >= 8.0:
                    continue
                # must be 100% on the wrist
                wi = list(j[vi]); wv = list(w[vi])
                top = int(wi[int(np.argmax(wv))])
                if top != BONE_INDEX[f'j_wrist{side}'] or max(wv) < 0.999:
                    bad += 1
                    if bad <= 10:
                        print(f'    FAIL[{tag}] side={side} statue=({sx:.1f},{sy:.1f},{sz:.1f}) top={BONES[top][0]} w={np.round(wv, 2).tolist()}')
                    continue
                # skinned vs rigid wrist transform
                M = worldm[f'j_wrist{side}']; r = bone_game[f'j_wrist{side}']
                rigid = (p - r) @ M[:3, :3].T + M[:3, 3]
                skin = np.zeros(3)
                for k in range(4):
                    if w[vi][k] <= 0: continue
                    bn = BONES[int(j[vi][k])][0]
                    Mk = worldm[bn]; rk = bone_game[bn]
                    skin += w[vi][k] * ((p - rk) @ Mk[:3, :3].T + Mk[:3, 3])
                dev = float(np.linalg.norm(skin - rigid))
                worst = max(worst, dev)
                ok += 1
        print(f'  hand rigidity [{tag}]: {ok} hand verts rigid, {bad} NOT on wrist, worst dev {worst*1000:.2f} mm')
        return bad == 0 and worst < 0.001
    okA = hand_rigidity_check(up_keep, up_w, up_j, 'upper')
    okB = hand_rigidity_check(lo_keep, lo_w, lo_j, 'lower')
    if not (okA and okB):
        print('  *** HAND RIGIDITY FAILED ***')

# ------------------------------------------------------------------ GLB writing
def pad4(n):
    return (4 - n % 4) % 4

def write_glb(path):
    bin_parts = []
    views = []
    accessors = []

    def add_view(np_arr, dtype_str):
        off = sum(len(b) for b in bin_parts)
        pad = pad4(off)
        if pad: bin_parts.append(b'\x00' * pad)
        off = sum(len(b) for b in bin_parts)
        raw = np_arr.astype(dtype_str).tobytes()
        bin_parts.append(raw)
        views.append((off, len(raw)))
        return len(views) - 1

    def add_accessor(view_i, count, comp_type, atype, minv=None, maxv=None):
        a = dict(bufferView=view_i, componentType=comp_type, count=count, type=atype)
        if minv is not None:
            a['min'] = minv; a['max'] = maxv
        accessors.append(a)
        return len(accessors) - 1

    # original images
    img_views = []
    for img in js.get('images', []):
        bv = js['bufferViews'][img['bufferView']]
        off0 = bv.get('byteOffset', 0)
        raw = bind[off0:off0 + bv['byteLength']]
        off = sum(len(b) for b in bin_parts)
        pad = pad4(off)
        if pad: bin_parts.append(b'\x00' * pad)
        off = sum(len(b) for b in bin_parts)
        bin_parts.append(raw)
        views.append((off, len(raw)))
        img_views.append(len(views) - 1)

    def add_mesh(m, w, j, name):
        pos = m['gpos']; nrm = m['gnormals']; uv = m['guvs']; idx = m['indices'].reshape(-1)
        a_pos = add_accessor(add_view(pos, '<f4'), len(pos), 5126, 'VEC3',
                             pos.min(axis=0).tolist(), pos.max(axis=0).tolist())
        a_nrm = add_accessor(add_view(nrm, '<f4'), len(nrm), 5126, 'VEC3',
                             nrm.min(axis=0).tolist(), nrm.max(axis=0).tolist())
        attrs = {'POSITION': a_pos, 'NORMAL': a_nrm}
        if uv is not None:
            attrs['TEXCOORD_0'] = add_accessor(add_view(uv, '<f4'), len(uv), 5126, 'VEC2')
        if w is not None:
            attrs['JOINTS_0'] = add_accessor(add_view(j.astype(np.uint8).reshape(-1), 'u1'), len(pos), 5121, 'VEC4')
            attrs['WEIGHTS_0'] = add_accessor(add_view(w, '<f4'), len(pos), 5126, 'VEC4')
        a_idx = add_accessor(add_view(idx.astype(np.uint32), '<u4'), len(idx), 5125, 'SCALAR')
        return {'name': name, 'primitives': [{'attributes': attrs, 'indices': a_idx, 'material': m['material']}]}

    meshes_arr = []
    meshes_arr.append(add_mesh(up_keep, up_w, up_j, 'knight_upper'))
    meshes_arr.append(add_mesh(lo_keep, lo_w, lo_j, 'knight_lower'))
    sword_mesh_i = None
    shield_mesh_i = None
    if sword is not None and len(sword['indices']):
        meshes_arr.append(add_mesh(sword, None, None, 'knight_sword'))
        sword_mesh_i = len(meshes_arr) - 1
    if shield is not None and len(shield['indices']):
        meshes_arr.append(add_mesh(shield, None, None, 'knight_shield'))
        shield_mesh_i = len(meshes_arr) - 1

    ibm = []
    for name, parent, p in BONES:
        M = np.eye(4); M[:3, 3] = bone_game[name]
        # glTF MAT4 accessors are COLUMN-MAJOR; numpy tobytes() is row-major
        # (C order) — transpose each matrix or the skinner reads it transposed
        # and the homogeneous w gets contaminated → vertical stretch bug.
        ibm.append(np.linalg.inv(M).T)
    a_ibm = add_accessor(add_view(np.array(ibm), '<f4'), len(ibm), 5126, 'MAT4')
    skins = [{'joints': [BONE_INDEX[n] for n, _, _ in BONES], 'inverseBindMatrices': a_ibm, 'name': 'knightSkin'}]

    nodes = []
    bone_node = {}
    for name, parent, p in BONES:
        rel = bone_game[name] - (bone_game[parent] if parent else np.zeros(3))
        nodes.append({'name': name, 'translation': rel.tolist()})
        bone_node[name] = len(nodes) - 1
    for name, parent, _ in BONES:
        if parent:
            nodes[bone_node[parent]].setdefault('children', []).append(bone_node[name])

    upper_node = len(nodes)
    nodes.append({'name': 'knight_upper', 'mesh': 0, 'skin': 0})
    lower_node = len(nodes)
    nodes.append({'name': 'knight_lower', 'mesh': 1, 'skin': 0})
    scene_nodes = [bone_node['j_root'], upper_node, lower_node]
    if sword_mesh_i is not None:
        n = len(nodes)
        nodes.append({'name': 'j_sword_held', 'mesh': sword_mesh_i})
        nodes[bone_node['j_wristR']].setdefault('children', []).append(n)
    if shield_mesh_i is not None:
        n = len(nodes)
        nodes.append({'name': 'j_shield_held', 'mesh': shield_mesh_i})
        nodes[bone_node['j_wristL']].setdefault('children', []).append(n)

    gltf = {
        'asset': {'version': '2.0', 'generator': 'KFS rigger v4 (rigid sabatons + rigid gauntlets)'},
        'scene': 0,
        'scenes': [{'name': 'knight', 'nodes': scene_nodes}],
        'nodes': nodes,
        'meshes': meshes_arr,
        'skins': skins,
        'materials': js['materials'],
        'textures': js.get('textures', []),
        'images': [{'bufferView': img_views[i], 'mimeType': js['images'][i].get('mimeType', 'image/png')}
                   for i in range(len(js.get('images', [])))],
        'samplers': js.get('samplers', [{'magFilter': 9729, 'minFilter': 9987}]),
        'accessors': accessors,
        'bufferViews': [{'buffer': 0, 'byteOffset': o, 'byteLength': l} for o, l in views],
        'buffers': [{'byteLength': 0}],
    }
    bindata = b''.join(bin_parts)
    gltf['buffers'][0]['byteLength'] = len(bindata)
    js_out = json.dumps(gltf, separators=(',', ':')).encode()
    js_out += b'\x20' * pad4(len(js_out))  # GLB spec: JSON chunk pads with SPACES
    total = 12 + 8 + len(js_out) + 8 + len(bindata)
    out_data = b'glTF' + struct.pack('<II', 2, total)
    out_data += struct.pack('<II', len(js_out), 0x4E4F534A) + js_out
    out_data += struct.pack('<II', len(bindata), 0x004E4942) + bindata
    open(path, 'wb').write(out_data)
    print(f'wrote {path} ({len(out_data)/1e6:.2f} MB) bones={len(BONES)} '
          f'upper={len(up_keep["indices"])} lower={len(lo_keep["indices"])} '
          f'sword={0 if sword is None else len(sword["indices"])} shield={len(shield["indices"])} tris')

write_glb(DST)

manifest = {
    'model': 'knight_rigged.glb',
    'height': 1.95,
    'bones': [n for n, _, _ in BONES],
    'boneGame': {n: bone_game[n].tolist() for n, _, _ in BONES},
    'swordNode': 'j_sword_held',
    'shieldNode': 'j_shield_held',
}
json.dump(manifest, open(MANIFEST, 'w'), indent=1)
print('wrote', MANIFEST)
