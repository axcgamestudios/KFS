#!/usr/bin/env python3
"""F28 — numeric autopsy of the kill/foot point clouds (the PNG renders came out
blank single-color; this reproduces the EXACT same filters straight from
knight_rigged.glb meshes[1] = knight_lower)."""
import json, struct
import numpy as np

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    json_len, _ = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20+json_len].decode('utf-8'))
    bin_off = 20 + json_len
    while bin_off % 4: bin_off += 1
    bin_len, _ = struct.unpack_from('<II', data, bin_off)
    return gltf, data[bin_off+8:bin_off+8+bin_len]

def read_acc(gltf, buf, acc_idx):
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    count, off = acc['count'], bv.get('byteOffset',0)+acc.get('byteOffset',0)
    stride = bv.get('byteStride', 0) or 12
    out = np.empty((count, 3))
    for k in range(count):
        out[k] = struct.unpack_from('<3f', buf, off + k*stride)
    return out

gltf, buf = load('/home/z/my-project/public/game/models/knight_rigged.glb')
p = gltf['meshes'][1]['primitives'][0]
pos = read_acc(gltf, buf, p['attributes']['POSITION'])

# joints/weights for dominant-bone attribution (4 ubyte joints + 4 float weights)
acc = gltf['accessors'][p['attributes']['JOINTS_0']]; bv = gltf['bufferViews'][acc['bufferView']]
off = bv.get('byteOffset',0)+acc.get('byteOffset',0); st = bv.get('byteStride',0) or 4
jts = np.array([struct.unpack_from('<4B', buf, off + k*st) for k in range(acc['count'])])
acc = gltf['accessors'][p['attributes']['WEIGHTS_0']]; bv = gltf['bufferViews'][acc['bufferView']]
off = bv.get('byteOffset',0)+acc.get('byteOffset',0); st = bv.get('byteStride',0) or 16
wts = np.array([struct.unpack_from('<4f', buf, off + k*st) for k in range(acc['count'])])
jnames = [gltf['nodes'][j].get('name','?') for j in gltf['skins'][0]['joints']]
dom = jts[np.arange(len(jts)), wts.argmax(axis=1)]
domname = np.array([jnames[d] for d in dom])

def hist2d(pts, xv, yv, xr, yr, nx=48, ny=26, title=''):
    """ASCII occupancy: xv/yv = column/row value arrays."""
    print(f"\n{title}   (cols: {xr[0]:+.2f}..{xr[1]:+.2f} {xv is pts[:,0] and 'X' or 'Z'} ->, rows: Y {yr[0]:+.2f} at bottom -> {yr[1]:+.2f} top)")
    H, xe, ye = np.histogram2d(pts[:,1], pts[:,xv[1] if isinstance(xv,tuple) else 0]*0+ (pts[:,2] if xv==2 else pts[:,0]),
                               bins=[np.linspace(*yr,ny+1), np.linspace(*xr,nx+1)])
    mx = H.max() or 1
    for j in range(ny-1, -1, -1):
        row = ''.join(' .:*#@'[min(5, int(H[j,i]*5/mx))] if H[j,i] > 0 else ' ' for i in range(nx))
        print(f"  y {ye[j]:+.2f} |{row}")

def hist2d_v2(pts, xa, ya, xr, yr, nx=48, ny=26, title=''):
    print(f"\n{title}   cols={xa} {xr[0]:+.2f}->{xr[1]:+.2f}, rows=Y {yr[0]:+.2f}->{yr[1]:+.2f} (top=+)")
    H, xe, ye = np.histogram2d(pts[:,ya], pts[:,xa], bins=[np.linspace(*yr,ny+1), np.linspace(*xr,nx+1)])
    mx = H.max() or 1
    for j in range(ny-1, -1, -1):
        row = ''.join(' .:*#@'[min(5, int(H[j,i]*5/mx))] if H[j,i] > 0 else ' ' for i in range(nx))
        print(f"  y {ye[j]:+.3f} |{row}")
    print(f"  n={len(pts)}  cell counts: max={int(mx)}")

kill_i = np.where((pos[:,2] > 0.104) & (pos[:,0] > -0.02) & (pos[:,1] < 1.12))[0]
kill = pos[kill_i]
foot = pos[(pos[:,0] > -0.05) & (pos[:,1] < 0.30) & (pos[:,2] <= 0.104)]

def bbox(q, name):
    print(f"{name}: n={len(q)} x[{q[:,0].min():+.3f},{q[:,0].max():+.3f}] "
          f"y[{q[:,1].min():+.3f},{q[:,1].max():+.3f}] z[{q[:,2].min():+.3f},{q[:,2].max():+.3f}]")

bbox(kill, "KILL cloud")
bbox(foot, "FOOT cloud")

print("\n=== KILL cloud: y-band census (counts + x/z extents) ===")
bands = [(0.00,0.10),(0.10,0.20),(0.20,0.30),(0.30,0.40),(0.40,0.50),(0.50,0.60),
         (0.60,0.70),(0.70,0.80),(0.80,0.90),(0.90,1.00),(1.00,1.12)]
for y0,y1 in bands:
    m = (kill[:,1]>=y0)&(kill[:,1]<y1)
    if not m.sum():
        print(f"  y[{y0:.2f},{y1:.2f})  n=0"); continue
    q = kill[m]
    print(f"  y[{y0:.2f},{y1:.2f}) n={m.sum():5d} x[{q[:,0].min():+.3f},{q[:,0].max():+.3f}] "
          f"z[{q[:,2].min():+.3f},{q[:,2].max():+.3f}]")

print("\n=== KILL cloud: dominant bone census ===")
for bn in np.unique(domname[kill_i]):
    m = domname[kill_i] == bn
    q = kill[m]
    print(f"  {bn:12s}: {m.sum():5d} verts  y[{q[:,1].min():+.3f},{q[:,1].max():+.3f}] "
          f"x[{q[:,0].min():+.3f},{q[:,0].max():+.3f}] z[{q[:,2].min():+.3f},{q[:,2].max():+.3f}]")

# --- the slab test: the suspected shield = kill verts clearly in front of the skirt sheet
for zcut in (0.135, 0.16, 0.20):
    s = kill[kill[:,2] > zcut]
    if len(s) < 5: 
        print(f"\nz>{zcut}: only {len(s)} verts"); continue
    bbox(s, f"\nKILL z>{zcut} (front of skirt sheet)")
    A = np.c_[s[:,1], np.ones(len(s))]
    coef, *_ = np.linalg.lstsq(A, s[:,2], rcond=None)
    r = s[:,2] - A@coef
    print(f"  z = {coef[0]:+.4f}*y {coef[1]:+.4f}  lean {np.degrees(np.arctan(coef[0])):+.1f} deg; "
          f"thickness resid rms {r.std()*1000:.1f} mm / max {abs(r).max()*1000:.1f} mm")

hist2d_v2(kill, 2, 1, (0.10, 0.31), (0.0, 1.12), 42, 28, "KILL: Z (horiz) vs Y — shield silhouette?")
hist2d_v2(kill, 0, 1, (-0.03, 0.43), (0.0, 1.12), 46, 28, "KILL: X (horiz) vs Y")

# --- low junk: kill verts at boot/shin heights
lowk = kill[kill[:,1] < 0.35]
bbox(lowk, "\nKILL @ y<0.35 (boot/shin zone)")
if len(lowk):
    hist2d_v2(lowk, 0, 1, (-0.03, 0.43), (0.0, 0.36), 46, 18, "KILL low: X vs Y")
    hist2d_v2(lowk, 2, 1, (0.10, 0.31), (0.0, 0.36), 42, 18, "KILL low: Z vs Y")
    print("  low-kill dominant bones:", {b:int((domname[kill_i][kill[:,1]<0.35]==b).sum()) for b in np.unique(domname[kill_i][kill[:,1]<0.35])})
    # are these verts part of the boot? compare with the boot's own cloud
    boot_all = pos[(pos[:,1]<0.30)&(pos[:,0]>-0.05)]
    front_boot = boot_all[boot_all[:,2] > 0.104]
    bbox(front_boot, "boot verts y<0.30 x>-0.05 with z>0.104 (front face of boot, EXCLUDED from 'staying')")
    print(f"  -> {100*len(front_boot)/max(1,len(boot_all)):.1f}% of the left-boot's verts live at z>0.104")

# --- FOOT cloud completeness
bbox(foot, "\nFOOT cloud (staying)")
hist2d_v2(foot, 2, 1, (-0.20, 0.31), (0.0, 0.31), 50, 15, "FOOT: Z vs Y")
hist2d_v2(foot, 0, 1, (-0.03, 0.35), (0.0, 0.31), 38, 15, "FOOT: X vs Y")
boot_all = pos[(pos[:,1]<0.30)&(pos[:,0]>-0.05)]
hist2d_v2(boot_all, 2, 1, (-0.20, 0.31), (0.0, 0.31), 50, 15, "FULL BOOT (y<0.30,x>-0.05): Z vs Y — cut at z=0.104 removes right part")
print(f"  full boot n={len(boot_all)} z[{boot_all[:,2].min():+.3f},{boot_all[:,2].max():+.3f}]; staying n={len(foot)}; "
      f"cut away n={len(boot_all)-len(foot)}")
sole = foot[foot[:,1] < 0.075]
print(f"  FOOT sole y<0.075: n={len(sole)} z[{sole[:,2].min():+.3f},{sole[:,2].max():+.3f}] x[{sole[:,0].min():+.3f},{sole[:,0].max():+.3f}]")
fs = boot_all[boot_all[:,1] < 0.075]
print(f"  FULL sole y<0.075: n={len(fs)} z[{fs[:,2].min():+.3f},{fs[:,2].max():+.3f}]")
toe = boot_all[boot_all[:,2] > 0.104]
print(f"  FULL boot toe/front z>0.104: n={len(toe)} y[{toe[:,1].min():+.3f},{toe[:,1].max():+.3f}] "
      f"x[{toe[:,0].min():+.3f},{toe[:,0].max():+.3f}] z[{toe[:,2].min():+.3f},{toe[:,2].max():+.3f}]")
