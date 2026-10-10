#!/usr/bin/env python3
"""Inspect GLB files: nodes, meshes, animations, materials, vertex counts."""
import json, struct, sys, os

def inspect(path):
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] != b'glTF':
        print(f"{os.path.basename(path)}: NOT A GLB"); return
    ver, total = struct.unpack('<II', data[4:12])
    # first chunk
    clen, ctype = struct.unpack('<II', data[12:20])
    assert ctype == 0x4E4F534A, f"first chunk must be JSON, got {hex(ctype)}"
    js = json.loads(data[20:20+clen].decode('utf-8'))
    print(f"\n===== {os.path.basename(path)} ({os.path.getsize(path)/1e6:.2f} MB) glTF{ver} =====")
    # accessors for vertex counts
    accs = js.get('accessors', [])
    meshes = js.get('meshes', [])
    total_verts = 0
    total_tris = 0
    print(f"meshes: {len(meshes)}, materials: {len(js.get('materials',[]))}, textures: {len(js.get('textures',[]))}, images: {len(js.get('images',[]))}, animations: {len(js.get('animations',[]))}")
    for m in meshes:
        vcount = 0; tcount = 0
        for p in m.get('primitives', []):
            pos = p['attributes'].get('POSITION')
            if pos is not None:
                vcount += accs[pos]['count']
            idx = p.get('indices')
            if idx is not None:
                tcount += accs[idx]['count'] // 3
            else:
                tcount += vcount // 3
        total_verts += vcount; total_tris += tcount
    print(f"TOTAL vertices: {total_verts}, triangles: {total_tris}")
    # animations detail
    for a in js.get('animations', []):
        print(f"  ANIM '{a.get('name','?')}': {len(a.get('channels',[]))} channels")
    # node names (top-level scene graph)
    nodes = js.get('nodes', [])
    named = [n.get('name','?') for n in nodes]
    print(f"nodes ({len(nodes)}): {named[:40]}{' ...' if len(named)>40 else ''}")
    # materials names
    mats = [m.get('name','?') for m in js.get('materials', [])]
    print(f"materials: {mats[:20]}{' ...' if len(mats)>20 else ''}")
    # skins
    skins = js.get('skins', [])
    print(f"skins: {len(skins)}" + (f" joints={len(skins[0]['joints'])}" if skins else ""))
    # images info
    for i, img in enumerate(js.get('images', [])[:12]):
        print(f"  image[{i}]: mime={img.get('mimeType','?')} bufferView={img.get('bufferView')}")
    # scenes root nodes
    scenes = js.get('scenes', [])
    if scenes:
        print(f"scene roots: {[nodes[i].get('name', i) for i in scenes[0].get('nodes', [])][:25]}")

for p in sys.argv[1:]:
    try:
        inspect(p)
    except Exception as e:
        print(f"{p}: ERROR {e}")
