#!/usr/bin/env python3
"""Dump raw material JSON + check COLOR_0 vertex colors in a GLB."""
import json, struct, sys

def glb_chunks(path):
    data = open(path, 'rb').read()
    total = struct.unpack('<I', data[8:12])[0]
    off = 12
    chunks = []
    while off < total:
        clen, ctype = struct.unpack('<II', data[off:off+8])
        chunks.append((ctype, data[off+8:off+8+clen]))
        off += 8 + clen
    js = json.loads(chunks[0][1].decode('utf-8'))
    bin_data = None
    for ctype, cdata in chunks[1:]:
        if ctype == 0x004E4942:
            bin_data = cdata
    return js, bin_data

js, bin_data = glb_chunks(sys.argv[1])
print('extensionsUsed:', js.get('extensionsUsed'))
print('extensionsRequired:', js.get('extensionsRequired'))
mats = js.get('materials', [])
for m in mats[:5]:
    print(json.dumps(m, indent=1))
# check COLOR_0 in accessors used by mesh primitives
attrs = set()
for mesh in js.get('meshes', []):
    for p in mesh.get('primitives', []):
        attrs.update(p.get('attributes', {}).keys())
print('all vertex attributes:', attrs)
