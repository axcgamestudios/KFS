#!/usr/bin/env python3
"""Inspecciona los inverseBindMatrices crudos de knight_rigged.glb."""
import struct, json, sys

path = '/home/z/my-project/public/game/models/knight_rigged.glb'
with open(path, 'rb') as f:
    data = f.read()

magic, version, length = struct.unpack('<4sII', data[:12])
print('GLB:', magic, version, length, 'bytes reales:', len(data))

# chunks
off = 12
chunks = {}
while off < len(data):
    clen, ctype = struct.unpack('<II', data[off:off+8])
    cdata = data[off+8:off+8+clen]
    chunks[ctype] = cdata
    off += 8 + clen

json_data = json.loads(chunks[0x4E4F534A].decode('utf-8'))
bin_data = chunks[0x004E4942]

for skin in json_data.get('skins', []):
    print('\nSKIN:', skin.get('name', '(sin nombre)'))
    print('  joints:', len(skin['joints']))
    ibm_acc_idx = skin['inverseBindMatrices']
    acc = json_data['accessors'][ibm_acc_idx]
    bv = json_data['bufferViews'][acc['bufferView']]
    print('  IBM accessor:', json.dumps(acc))
    # leer floats
    compType = acc.get('componentType', 5126)
    count = acc['count']
    offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride', 0) or 64
    fmt = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B', 5122: 'h'}[compType]
    n_infs = 0
    n_nans = 0
    for i in range(count):
        row = struct.unpack_from('<16' + fmt, bin_data, offset + i * stride)
        bad_inf = sum(1 for v in row if v == float('inf') or v == float('-inf'))
        bad_nan = sum(1 for v in row if v != v)
        n_infs += bad_inf
        n_nans += bad_nan
        if bad_inf or bad_nan or i < 2:
            print(f'  bone[{i}] row0={row[0]:+.4f} row1={row[1]:+.4f} ... inf={bad_inf} nan={bad_nan}')
    print(f'  TOTAL: inf={n_infs}, nan={n_nans} de {count*16} valores')

# también revisar el nodo raíz y las matrices de nodos
print('\n=== NODOS con matrix/translation/scale ===')
for i, node in enumerate(json_data.get('nodes', [])):
    has_matrix = 'matrix' in node
    keys = [k for k in ('translation', 'rotation', 'scale', 'matrix', 'weights') if k in node]
    if has_matrix or 'scale' in node:
        print(f"  node[{i}] {node.get('name','?')}: keys={keys}")
        if has_matrix:
            print('    matrix:', ['%+.4f' % v for v in node['matrix'][:16]])
        if 'scale' in node:
            print('    scale:', node['scale'])
