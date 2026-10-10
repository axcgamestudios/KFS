#!/usr/bin/env python3
"""Analyze the knight GLB for rigging: cross-sections at many heights to find
body landmarks (crotch, waist, shoulders, neck) and lateral clusters (legs, arms)."""
import json, struct
import numpy as np

def load(path):
    data = open(path, 'rb').read()
    clen, ctype = struct.unpack('<II', data[12:20])
    js = json.loads(data[20:20+clen].decode())
    off = 20 + clen
    blen, btype = struct.unpack('<II', data[off:off+8])
    bind = data[off+8:off+8+blen]
    return js, bind

def accessor_acc(js, bind, idx):
    accs = js['accessors']; views = js['bufferViews']
    a = accs[idx]; v = views[a['bufferView']]
    off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    comp = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
    fmt = {5126: 'f4', 5125: 'u4', 5123: 'u2'}[a['componentType']]
    dt = np.frombuffer(bind, dtype=np.dtype(fmt), count=a['count'] * comp, offset=off)
    return dt.reshape(a['count'], comp)

def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=float).reshape(4, 4)
    t = n.get('translation', [0, 0, 0]); q = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
    x, y, z, w = q
    R = np.array([[1-2*(y*y+z*z), 2*(x*y-w*z), 2*(x*z+w*y)],
                  [2*(x*y+w*z), 1-2*(x*x+z*z), 2*(y*z-w*x)],
                  [2*(x*z-w*y), 2*(y*z+w*x), 1-2*(x*x+y*y)]])
    m = np.eye(4); m[:3, :3] = R * np.array(s); m[:3, 3] = t
    return m

def get_triangles(path):
    """Return world-space triangles as (N, 3, 3) float array + per-tri mesh tag."""
    js, bind = load(path)
    nodes = js['nodes']
    tris = []
    tags = []
    def walk(ni, parent_m, tag):
        n = nodes[ni]
        m = parent_m @ node_matrix(n)
        if 'mesh' in n:
            for p in js['meshes'][n['mesh']]['primitives']:
                pos = accessor_acc(js, bind, p['attributes']['POSITION'])
                hom = np.hstack([pos, np.ones((len(pos), 1))])
                world = (hom @ m.T)[:, :3]
                idx = accessor_acc(js, bind, p['indices']).astype(np.int64).reshape(-1)
                t = world[idx].reshape(-1, 3, 3)
                tris.append(t)
                tags.append(np.full(len(t), 1 if tag == 'Upper' else 0))
        for c in n.get('children', []):
            walk(c, m, tag if tag else nodes[c].get('name'))
    def walk2(ni, parent_m):
        n = nodes[ni]
        m = parent_m @ node_matrix(n)
        name = n.get('name', '')
        if 'mesh' in n and name not in ('Sketchfab_model',):
            pass
        for c in n.get('children', []):
            cn = nodes[c]
            walk(c, m, cn.get('name'))
    for r in js['scenes'][0]['nodes']:
        n = nodes[r]
        for c in n.get('children', []):
            cn = nodes[c]
            if 'collada' in cn.get('name', '').lower():
                for cc in cn.get('children', []):
                    walk(cc, np.eye(4), nodes[cc].get('name'))
    T = np.vstack(tris)
    TG = np.concatenate(tags)
    return T, TG

if __name__ == '__main__':
    T, TG = get_triangles('public/game/models/knight_statue.glb')
    print(f'triangles: {len(T)}  upper: {(TG==1).sum()}  lower: {(TG==0).sum()}')
    cy = (T[:, :, 1].max(axis=1) + T[:, :, 1].min(axis=1)) / 2  # tri center y
    ylo, yhi = cy.min(), cy.max()
    print(f'y range: {ylo:.1f} .. {yhi:.1f}')
    # Cross-section analysis: at each height, cluster points by XZ proximity
    from scipy import ndimage
    pts = T.reshape(-1, 3)
    # unique-ish vertex list for speed
    for h in np.arange(ylo + 3, yhi, 4.0):
        band = pts[(pts[:, 1] > h - 2) & (pts[:, 1] < h + 2)]
        if len(band) < 30: continue
        x = band[:, 0]; z = band[:, 2]
        # cluster by simple grid DBSCAN-ish: use scipy cKDTree
        from scipy.spatial import cKDTree
        tree = cKDTree(band[:, [0, 2]])
        pairs = tree.query_pairs(6.0)
        # union-find
        parent = list(range(len(band)))
        def find(a):
            while parent[a] != a:
                parent[a] = parent[parent[a]]; a = parent[a]
            return a
        for a, b in pairs:
            ra, rb = find(a), find(b)
            if ra != rb: parent[ra] = rb
        groups = {}
        for i in range(len(band)):
            groups.setdefault(find(i), []).append(i)
        big = [(len(g), band[g][:, 0].mean(), band[g][:, 2].mean(), band[g][:, 0].min(), band[g][:, 0].max())
               for g in groups.values() if len(g) > 25]
        big.sort(reverse=True)
        print(f'y={h:7.1f}  pts={len(band):5d}  clusters={len(big):2d}: ' +
              '  '.join(f'[n={n} x={mx:6.1f} z={mz:6.1f} xr={x0:.0f}..{x1:.0f}]' for n, mx, mz, x0, x1 in big[:6]))
