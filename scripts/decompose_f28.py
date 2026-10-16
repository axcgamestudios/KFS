#!/usr/bin/env python3
"""F28 FINAL — ground-truth decomposition of the kill/foot clouds + working renders.
Ground truth from the SOURCE statue (knight_statue.glb Lower mesh):
  - comp 18186 = welded skirt/pelvis block (statue Y -17.4..+11.7) -> the LEGIT skirt
  - comp 2320  = welded shield core (extracted as the knight_shield prop)
  - everything else = detached tris; shield-vs-body resolved by z envelopes:
    the RIGHT side (no shield, no sword after prop extraction) shows the body never
    exceeds z ~ 0.136 game; the shield plate spans z 0.118..0.317 (curved heater)."""
import json, struct
import numpy as np
from scipy.spatial import cKDTree
from PIL import Image, ImageDraw

OUT = '/home/z/my-project/scripts/shots_f28'
G = 1.95 / 210.0

def load(path):
    with open(path, 'rb') as f: data = f.read()
    jl, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+jl].decode())
    bo = 20 + jl
    while bo % 4: bo += 1
    bl, _ = struct.unpack_from('<II', data, bo)
    return gltf, data[bo+8:bo+8+bl]

def rp(gltf, buf, mesh_idx):
    p = gltf['meshes'][mesh_idx]['primitives'][0]
    a = gltf['accessors'][p['attributes']['POSITION']]
    bv = gltf['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset',0)+a.get('byteOffset',0); st = bv.get('byteStride',0) or 12
    out = np.empty((a['count'],3))
    for k in range(a['count']): out[k] = struct.unpack_from('<3f', buf, off+k*st)
    return out

# ---------------- statue side: welded components ----------------
sg, sb = load('/home/z/my-project/public/game/models/knight_statue.glb')
print("statue meshes:", [(i, m.get('name')) for i, m in enumerate(sg['meshes'])])
statue_lo = rp(sg, sb, 0)   # Lower mesh of the statue (mesh 0 per component_analysis)

# rerun the union-find exactly like component_analysis (shared vertex indices)
p = sg['meshes'][0]['primitives'][0]
acc = sg['accessors'][p['attributes']['POSITION']]; bv = sg['bufferViews'][acc['bufferView']]
off = bv.get('byteOffset',0)+acc.get('byteOffset',0); st = bv.get('byteStride',0) or 12
n = acc['count']
pos_st = np.empty((n,3))
for k in range(n): pos_st[k] = struct.unpack_from('<3f', sb, off+k*st)
ai = sg['accessors'][p['attributes']['JOINTS_0']] if 'JOINTS_0' in p['attributes'] else None
idx_acc = sg['accessors'][p['indices']]
bv2 = sg['bufferViews'][idx_acc['bufferView']]
off2 = bv2.get('byteOffset',0)+idx_acc.get('byteOffset',0); st2 = bv2.get('byteStride',0) or 4
nt = idx_acc['count']//3
tri = np.empty((nt*3), dtype=np.int64)
for k in range(nt*3): tri[k] = struct.unpack_from('<I', sb, off2+k*st2)[0]
tri = tri.reshape(-1,3)
print(f"statue Lower: {n} verts, {nt} tris")

parent = np.arange(nt, dtype=np.int64)
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
for c in range(3):
    c2 = (c+1)%3
    e = np.stack([tri[:,c], tri[:,c2]], axis=1); e.sort(axis=1)
    o = np.lexsort((e[:,1], e[:,0])); es = e[o]
    ng = np.ones(len(es), dtype=bool); ng[1:] = (es[1:] != es[:-1]).any(axis=1)
    eid = np.cumsum(ng)-1
    edge_ids = np.empty(len(es), dtype=np.int64); edge_ids[o] = eid
    toe = np.repeat(np.arange(nt), 3)
    o2 = np.argsort(edge_ids, kind='stable')
    ei = edge_ids[o2]; tt = toe[o2]
    same = ei[1:] == ei[:-1]
    for k in np.nonzero(same)[0]:
        ra, rb = find(tt[k]), find(tt[k+1])
        if ra != rb: parent[ra] = rb
roots = np.array([find(i) for i in range(nt)])
uniq, counts = np.unique(roots, return_counts=True)
big = sorted(zip(uniq, counts), key=lambda t: -t[1])[:2]
comp_of_tri = roots
# identify which big comp is skirt (z min < 0) vs shield (z min > 11)
tag_of_comp = {}
for u, cnt in big:
    tv = pos_st[tri[comp_of_tri == u]].reshape(-1,3)
    tag = 'shield' if tv[:,2].min() > 11 else 'skirtblock'
    tag_of_comp[u] = tag
    print(f"comp {u}: {cnt} tris -> {tag}  X[{tv[:,0].min():+.1f},{tv[:,0].max():+.1f}] "
          f"Y[{tv[:,1].min():+.1f},{tv[:,1].max():+.1f}] Z[{tv[:,2].min():+.1f},{tv[:,2].max():+.1f}]")
skirt_comp = [u for u,t in tag_of_comp.items() if t=='skirtblock'][0]
shield_comp = [u for u,t in tag_of_comp.items() if t=='shield'][0]
skirt_verts_st = pos_st[tri[comp_of_tri == skirt_comp]].reshape(-1,3)
shield_verts_st = pos_st[tri[comp_of_tri == shield_comp]].reshape(-1,3)
tSkirt = cKDTree(skirt_verts_st)
tShield = cKDTree(shield_verts_st)

# ---------------- game side ----------------
gg, gb = load('/home/z/my-project/public/game/models/knight_rigged.glb')
lower = rp(gg, gb, 1)
kill_mask = (lower[:,2] > 0.104) & (lower[:,0] > -0.02) & (lower[:,1] < 1.12)
foot_mask = (lower[:,0] > -0.05) & (lower[:,1] < 0.30) & (lower[:,2] <= 0.104)
kill = lower[kill_mask]; foot = lower[foot_mask]
kill_st = np.c_[kill[:,0]/G, kill[:,1]/G - 104.0, kill[:,2]/G]   # back to statue coords
foot_st = np.c_[foot[:,0]/G, foot[:,1]/G - 104.0, foot[:,2]/G]

dS, _ = tSkirt.query(kill_st)   # distance to welded skirt block (statue units)
dW, _ = tShield.query(kill_st)  # distance to welded shield core (statue units)
SK_TOL, SH_TOL = 0.05, 0.05     # statue units (~0.5 mm)
is_skirt = dS < SK_TOL
is_welded_shield = dW < SH_TOL
print(f"\nkill verts matching welded SKIRT block positions: {is_skirt.sum()}")
print(f"kill verts matching welded SHIELD core positions: {is_welded_shield.sum()} (should be ~0 — core went to the prop)")

# right-side (clean) body z envelope by y band, from knight_lower
print("\nRIGHT side (x<-0.05, no shield/sword) z envelope by y band — clean body reference:")
zmax_ref = {}
for y0,y1,tag in [(0.00,0.30,'boot'),(0.30,0.46,'shin'),(0.46,0.70,'thigh'),(0.70,0.80,'low skirt'),(0.80,1.12,'skirt')]:
    m = (lower[:,1]>=y0)&(lower[:,1]<y1)&(lower[:,0]<-0.05)
    q = lower[m]
    if len(q):
        zmax_ref[tag] = q[:,2].max()
        print(f"  {tag:10s} y[{y0:.2f},{y1:.2f}) n={len(q):5d} z[{q[:,2].min():+.3f},{q[:,2].max():+.3f}] x[{q[:,0].min():+.3f},{q[:,0].max():+.3f}]")

# ---------------- FINAL classification ----------------
# boot lateral envelope from the statue ground band (left foot mass ~x -0.4..+16 statue)
BOOT_X = 0.155   # game; left boot proper (mirrors right boot width 0.171 centered +0.08)
cls = np.full(len(kill), 'shield_remnant', dtype=object)
cls[is_skirt] = 'skirt_legit'
boot_toe = (~is_skirt) & (kill[:,1] < 0.30) & (kill[:,0] <= BOOT_X) & (kill[:,2] <= 0.140)
cls[boot_toe] = 'boot_toe_front'
hand = (~is_skirt) & (kill[:,1] >= 0.90) & (kill[:,0] > 0.15) & (kill[:,2] <= 0.14)
cls[hand] = 'hand_or_grip?'
print("\n=== FINAL KILL decomposition (n=%d) ===" % len(kill))
summary = {}
for c in ['shield_remnant','skirt_legit','boot_toe_front','hand_or_grip?']:
    m = cls == c
    if not m.sum(): continue
    q = kill[m]
    summary[c] = dict(n=int(m.sum()), x=[float(q[:,0].min()),float(q[:,0].max())],
                      y=[float(q[:,1].min()),float(q[:,1].max())], z=[float(q[:,2].min()),float(q[:,2].max())])
    print(f"  {c:15s} n={m.sum():5d} x[{q[:,0].min():+.3f},{q[:,0].max():+.3f}] "
          f"y[{q[:,1].min():+.3f},{q[:,1].max():+.3f}] z[{q[:,2].min():+.3f},{q[:,2].max():+.3f}]")

rem = kill[cls=='shield_remnant']
print(f"\n=== shield remnant plate geometry (n={len(rem)}) ===")
print("  width by y (heater taper):")
for y0 in np.arange(0.0, 1.09, 0.1):
    m = (rem[:,1]>=y0)&(rem[:,1]<y0+0.1)
    if m.sum() >= 3:
        q = rem[m]
        print(f"    y[{y0:.1f},{y0+0.1:.1f}) n={m.sum():4d} width={q[:,0].max()-q[:,0].min():.3f} m "
              f"x[{q[:,0].min():+.3f},{q[:,0].max():+.3f}] z[{q[:,2].min():+.3f},{q[:,2].max():+.3f}]")
A = np.c_[rem[:,1], np.ones(len(rem))]
coef, *_ = np.linalg.lstsq(A, rem[:,2], rcond=None)
r = rem[:,2] - A@coef
print(f"  lean fit z={coef[0]:+.4f}*y{coef[1]:+.4f} -> {np.degrees(np.arctan(coef[0])):+.1f} deg from vertical; resid rms {r.std()*1000:.0f} mm (plate curvature)")

# ---------------- foot / staying cloud ----------------
dSf, _ = tSkirt.query(foot_st)
f_skirt = dSf < SK_TOL
fcls = np.where(foot[:,0] <= BOOT_X, 'boot_keep', 'shield_base_junk')
fcls[f_skirt] = 'skirt_hem?'
print(f"\n=== FOOT (staying) decomposition (n={len(foot)}) ===")
for c in ['boot_keep','shield_base_junk','skirt_hem?']:
    m = fcls == c
    if not m.sum(): continue
    q = foot[m]
    print(f"  {c:16s} n={m.sum():4d} x[{q[:,0].min():+.3f},{q[:,0].max():+.3f}] "
          f"y[{q[:,1].min():+.3f},{q[:,1].max():+.3f}] z[{q[:,2].min():+.3f},{q[:,2].max():+.3f}]")
bootL_full = lower[(lower[:,1]<0.30)&(lower[:,0]>=-0.02)&(lower[:,0]<=BOOT_X)]
toe_front = bootL_full[bootL_full[:,2] > 0.104]
print(f"\n  LEFT boot proper (x<= {BOOT_X}, y<0.30): n={len(bootL_full)} "
      f"x[{bootL_full[:,0].min():+.3f},{bootL_full[:,0].max():+.3f}] z[{bootL_full[:,2].min():+.3f},{bootL_full[:,2].max():+.3f}]")
print(f"  ...of which the cut removes the front (z>0.104): n={len(toe_front)} "
      f"({100*len(toe_front)/max(1,len(bootL_full)):.0f}%)  y[{toe_front[:,1].min():+.3f},{toe_front[:,1].max():+.3f}] "
      f"z[{toe_front[:,2].min():+.3f},{toe_front[:,2].max():+.3f}]")
sole_keep = foot[(fcls=='boot_keep')&(foot[:,1]<0.075)]
print(f"  staying boot sole: n={len(sole_keep)} z[{sole_keep[:,2].min():+.3f},{sole_keep[:,2].max():+.3f}] "
      f"x[{sole_keep[:,0].min():+.3f},{sole_keep[:,0].max():+.3f}]")

json.dump(dict(kill=summary, kill_n=int(len(kill)), foot_n=int(len(foot)),
               foot={c: dict(n=int((fcls==c).sum())) for c in set(fcls)},
               boot_x=float(BOOT_X)),
          open(f'{OUT}/f28_decomposition.json','w'), indent=1)
print(f"\nwrote {OUT}/f28_decomposition.json")

# persist per-vertex masks for reuse (indices into knight_lower POSITION accessor)
np.savez(f'{OUT}/f28_kill_classes.npz',
         kill_mask=kill_mask, foot_mask=foot_mask,
         kill_class=cls, foot_class=fcls,
         is_skirt_block=is_skirt, matches_welded_shield=is_welded_shield)
print(f"wrote {OUT}/f28_kill_classes.npz")

# ---------------- renders ----------------
BG=(32,36,43); GRID=(52,58,68); GRID0=(66,72,84)
COL={'shield_remnant':(235,100,90),'skirt_legit':(120,215,130),'boot_toe_front':(100,165,245),
     'hand_or_grip?':(240,190,90),'boot_keep':(100,165,245),'shield_base_junk':(235,100,90),'skirt_hem?':(120,215,130)}
PLAIN=(205,210,220)
def render(pts, classes, az, el, path, title, classed=False):
    W,H=820,940
    azr,elr=np.radians(az),np.radians(el)
    fwd=-np.array([np.sin(azr)*np.cos(elr), np.sin(elr), np.cos(azr)*np.cos(elr)])
    right=np.cross(fwd,[0,1,0]); right/=np.linalg.norm(right)
    up=np.cross(right,fwd)
    proj=lambda p: np.array([np.dot(p,right), np.dot(p,up)])
    gl=[]
    for k in (-1.0,0.0,1.0):
        gl.append((proj([k,0,-1]), proj([k,0,1]), abs(k)<1e-9))
        gl.append((proj([-1,0,k]), proj([1,0,k]), abs(k)<1e-9))
    P=np.array([proj(p) for p in pts])
    G=np.array([g[0] for g in gl]+[g[1] for g in gl])
    lo=np.minimum(P.min(axis=0),G.min(axis=0)); hi=np.maximum(P.max(axis=0),G.max(axis=0))
    span=np.maximum(hi-lo,[0.05,0.05]); mid=(hi+lo)/2
    sc=min((W-140)/span[0],(H-190)/span[1])
    sx=lambda u: W/2+(u-mid[0])*sc
    sy=lambda v: H/2-(v-mid[1])*sc+26
    img=Image.new('RGB',(W,H),BG); dr=ImageDraw.Draw(img)
    for a,b,is0 in gl:
        dr.line([sx(a[0]),sy(a[1]),sx(b[0]),sy(b[1])], fill=GRID0 if is0 else GRID, width=1)
    dep=pts@fwd
    rng=dep.max()-dep.min()
    t=(dep-dep.min())/(rng if rng>1e-9 else 1)
    for i in np.argsort(dep):
        u,v=P[i]; x,y=sx(u),sy(v)
        base=np.array(COL[classes[i]] if classed else PLAIN,float)
        col=tuple(int(c) for c in base*(0.55+0.45*(1-t[i])))
        dr.rectangle([x-2,y-2,x+2,y+2], fill=col)
    dr.text((14,8), title, fill=(185,190,200))
    dr.text((14,24), f"n={len(pts)}  az={az:.0f} el={el:.0f}  orthographic  1m grid  (Y up, ground y=0)", fill=(140,146,156))
    if classed:
        lx=14
        for c in dict.fromkeys(classes):
            dr.rectangle([lx,44,lx+10,54], fill=COL[c]); dr.text((lx+14,44), c, fill=(200,206,214)); lx+=170
    img.save(path); print("wrote", path)

render(kill,['x']*len(kill),25,8, f'{OUT}/killpts_front.png',"KILL cloud — front (model faces +Z; LEFT=+X=screen right)")
render(kill,['x']*len(kill),90,8, f'{OUT}/killpts_left.png',"KILL cloud — left side view (az 90)")
render(kill,['x']*len(kill),30,45,f'{OUT}/killpts_high.png',"KILL cloud — high angle (el 45)")
render(foot,['x']*len(foot),25,8, f'{OUT}/footpts_front.png',"STAYING foot cloud — front view")
render(kill,cls,          25,8, f'{OUT}/killpts_front_class.png',"KILL cloud CLASSIFIED — front",classed=True)
render(kill,cls,          90,8, f'{OUT}/killpts_left_class.png',"KILL cloud CLASSIFIED — side",classed=True)
render(foot,fcls,         25,8, f'{OUT}/footpts_front_class.png',"STAYING foot cloud CLASSIFIED",classed=True)
