#!/usr/bin/env python3
"""Fase 12 — inspect kit GLBs: mesh names, materials, textures, vertex colors."""
import json, struct, sys

def glb_chunks(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'glTF', path
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

def inspect(path):
    print(f'===== {path} =====')
    js, _ = glb_chunks(path)
    print(f'  generator: {js.get("asset", {}).get("generator", "?")}')
    print(f'  images: {len(js.get("images", []))}, textures: {len(js.get("textures", []))}, materials: {len(js.get("materials", []))}')
    for i, img in enumerate(js.get('images', [])):
        print(f'    image[{i}]: name={img.get("name","?")} mime={img.get("mimeType","?")}')
    for i, mat in enumerate(js.get('materials', [])):
        pbr = mat.get('pbrMetallicRoughness', {})
        base = pbr.get('baseColorFactor', 'none')
        tex = pbr.get('baseColorTexture', 'none')
        vc = pbr.get('vertexColor', mat.get('extensions', {}).get('KHR_materials_common'))
        print(f'    mat[{i}]: name={mat.get("name","?")} baseColorFactor={base} baseTex={tex} doubleSided={mat.get("doubleSided", False)}')
    # mesh -> primitives -> material
    meshes = js.get('meshes', [])
    nodes = js.get('nodes', [])
    print(f'  meshes: {len(meshes)}, nodes: {len(nodes)}')
    mat_names = {i: m.get('name', f'mat{i}') for i, m in enumerate(js.get('materials', []))}
    mesh_info = []
    for i, m in enumerate(meshes):
        prims = m.get('primitives', [])
        mats = [mat_names.get(p.get('material', -1), 'NONE') for p in prims]
        tri = 0
        for p in prims:
            idx = p.get('indices')
            cnt = 0
            if idx is not None:
                acc = js['accessors'][idx]
                cnt = acc.get('count', 0) // 3
            tri += cnt
        mesh_info.append((m.get('name', f'mesh{i}'), mats, tri))
    # top-level nodes with meshes
    def node_meshes(ni, depth=0):
        n = nodes[ni]
        out = []
        if 'mesh' in n:
            out.append((ni, n.get('name', f'node{ni}'), n['mesh']))
        for c in n.get('children', []):
            out.extend(node_meshes(c, depth+1))
        return out
    roots = [i for i, n in enumerate(nodes) if 'children' in n or 'mesh' in n]
    # find root nodes (not referenced as children)
    referenced = set()
    for n in nodes:
        for c in n.get('children', []):
            referenced.add(c)
    tops = [i for i in range(len(nodes)) if i not in referenced]
    total_tris = 0
    for t in tops[:80]:
        for _, name, mi in node_meshes(t):
            mn, mats, tri = mesh_info[mi]
            total_tris += tri
            if len(mats) <= 3:
                print(f'    node "{name}" mesh="{mn}" mats={mats} tris={tri}')
            else:
                print(f'    node "{name}" mesh="{mn}" mats={mats[:3]}...({len(mats)}) tris={tri}')
    print(f'  TOTAL tris: {total_tris}')

for p in sys.argv[1:]:
    inspect(p)
