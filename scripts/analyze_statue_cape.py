# analyze_statue_cape.py — Fase 26: map knight_statue.glb's low geometry:
# where do the near-ground verts live — feet (z>0), tassets, or shield? Are
# BOTH feet forward (+Z)? (inline loader — rig_knight.py runs at import)
import json, struct
import numpy as np

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
                hp = np.hstack([pos, np.ones((len(pos), 1))])
                wpos = (hp @ m.T)[:, :3]
                out.append(dict(tag=tag, positions=wpos))
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

js, bind = load_glb('../public/game/models/knight_statue.glb')
meshes = get_world_meshes(js, bind)
for m in meshes:
    p = m['positions']
    print(f"mesh {m['tag']}: {len(p)} verts, bbox x[{p[:,0].min():.0f},{p[:,0].max():.0f}] y[{p[:,1].min():.0f},{p[:,1].max():.0f}] z[{p[:,2].min():.0f},{p[:,2].max():.0f}]")

lo = next(m for m in meshes if m['tag'] == 'Lower')
up = next(m for m in meshes if m['tag'] == 'Upper')

# 2. low verts census (y < -86): z histogram — what hangs near the feet?
p = lo['positions']
low = p[p[:, 1] < -86]
print(f"\nLOWER low verts (y<-86): {len(low)}")
if len(low):
    hist, edges = np.histogram(low[:, 2], bins=12)
    for h, e in zip(hist, edges):
        print(f"  z in [{e:6.0f},{e+ (edges[1]-edges[0]):6.0f}): {h}")
    print("low x range:", low[:, 0].min(), low[:, 0].max())

# 3. side view: the foot verts (y<-88, z>0)
feet = p[(p[:, 1] < -88) & (p[:, 2] > 0)]
print(f"\nfoot verts (y<-88,z>0): {len(feet)}")
if len(feet):
    print(f"  x[{feet[:,0].min():.0f},{feet[:,0].max():.0f}] z[{feet[:,2].min():.0f},{feet[:,2].max():.0f}] y[{feet[:,1].min():.0f},{feet[:,1].max():.0f}]")
    fr = feet[feet[:, 0] < -9]; fl = feet[feet[:, 0] > -9]
    print(f"  right-ish (x<-9): {len(fr)}  left-ish (x>=-9): {len(fl)}")

# 4. cape area estimate: for a real cape we want a CONTIGUOUS back sheet
#    spanning y from shoulders (~60) to below the waist — check UPPER back
p = up['positions']
back = p[(p[:, 2] < -26) & (p[:, 1] > 0)]
print(f"\nUPPER back sheet (z<-26, y>0): {len(back)} verts, y[{back[:,1].min():.0f},{back[:,1].max():.0f}]" if len(back) else "no upper back sheet")

# 5. BOTH feet, generous: y<-86, split by x sign, z extent each
for m, tag in ((lo, 'LOWER'), (up, 'UPPER')):
    q = m['positions']
    feetL = q[(q[:, 1] < -86) & (q[:, 0] > -9)]
    feetR = q[(q[:, 1] < -86) & (q[:, 0] <= -9)]
    for nm, f in (('L(x>-9)', feetL), ('R(x<=-9)', feetR)):
        if len(f):
            print(f"{tag} low {nm}: {len(f)} verts z[{f[:,2].min():.0f},{f[:,2].max():.0f}] y[{f[:,1].min():.0f},{f[:,1].max():.0f}] x[{f[:,0].min():.0f},{f[:,0].max():.0f}]")
