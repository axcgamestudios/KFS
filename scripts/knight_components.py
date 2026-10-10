#!/usr/bin/env python3
"""Connected-component analysis of the knight meshes at triangle level.
Shared edges connect triangles. Reports each shell's bbox + tri count."""
import numpy as np
import sys
sys.path.insert(0, '/home/z/my-project/scripts')
from knight_analysis import get_triangles

T, TG = get_triangles('public/game/models/knight_statue.glb')

def components(tris):
    """tris: (N,3,3). Union-find over shared edges (quantized vertices)."""
    n = len(tris)
    parent = np.arange(n, dtype=np.int64)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    # quantize vertices to merge near-identical positions
    v = tris.reshape(-1, 3)
    q = np.round(v / 0.05).astype(np.int64)
    # hash: use lexsort to group identical
    order = np.lexsort((q[:, 2], q[:, 1], q[:, 0]))
    qs = q[order]
    # group boundaries
    new_group = np.ones(len(qs), dtype=bool)
    new_group[1:] = (qs[1:] != qs[:-1]).any(axis=1)
    gid = np.cumsum(new_group) - 1
    vertex_id = np.empty(len(qs), dtype=np.int64)
    vertex_id[order] = gid
    # edge -> triangle map: for each of 3 edges per tri
    tri_of_edge = np.repeat(np.arange(n), 3)  # edge k (k=0..3n-1) belongs to tri k//3
    a_idx = vertex_id[np.arange(3 * n) * 0]  # placeholder
    # vertex ids per corner: tri i corner c -> q index i*3+c
    corners = vertex_id  # already aligned: tri i corners are q[i*3], q[i*3+1], q[i*3+2]
    for c in range(3):
        c2 = (c + 1) % 3
        e = np.stack([cornors := corners.reshape(n, 3)[:, c], corners.reshape(n, 3)[:, c2]], axis=1)
        # sort edge endpoints
        e.sort(axis=1)
        # group identical edges
        o = np.lexsort((e[:, 1], e[:, 0]))
        es = e[o]
        ng = np.ones(len(es), dtype=bool)
        ng[1:] = (es[1:] != es[:-1]).any(axis=1)
        eid = np.cumsum(ng) - 1
        edge_ids = np.empty(len(es), dtype=np.int64)
        edge_ids[o] = eid
        # for each edge group with >1 tri, union them: build edge->first tri
        # process: sort by edge id, then within same edge union tris
        order2 = np.argsort(edge_ids, kind='stable')
        ei_sorted = edge_ids[order2]
        t_sorted = tri_of_edge[order2]
        # same edge consecutive: union consecutive tris with equal edge id
        same = ei_sorted[1:] == ei_sorted[:-1]
        idxs = np.nonzero(same)[0]
        for k in idxs:
            ra, rb = find(t_sorted[k]), find(t_sorted[k + 1])
            if ra != rb:
                parent[ra] = rb
    roots = np.array([find(i) for i in range(n)])
    return roots

for tag, name in ((0, 'LOWER'), (1, 'UPPER')):
    sub = T[TG == tag]
    roots = components(sub)
    uniq, counts = np.unique(roots, return_counts=True)
    order = np.argsort(-counts)
    print(f'\n===== {name}: {len(sub)} tris, {len(uniq)} components =====')
    for r in order[:15]:
        mask = roots == uniq[r]
        c = sub[mask]
        pts = c.reshape(-1, 3)
        print(f'  comp {r}: {mask.sum():6d} tris  y:{pts[:,1].min():7.1f}..{pts[:,1].max():7.1f}  '
              f'x:{pts[:,0].min():7.1f}..{pts[:,0].max():7.1f}  z:{pts[:,2].min():7.1f}..{pts[:,2].max():7.1f}')
