#!/usr/bin/env python3
"""Fix arg-order: `...LW(a, b), y` -> `...P(a, b, y)` in BritishVillage.ts.
LW returns [x, z]; spread + y gives (x, z, y) which is the WRONG order for
three.js (x, y, z). P(a, b, y) returns [x, y, z].
"""
import re

PATH = '/home/z/my-project/src/game/structures/BritishVillage.ts'
src = open(PATH).read()

# add the P helper right after the V helper definition in buildBritishCabin
if 'const P = (' not in src:
    src = src.replace(
        """  /** Local point + height -> world Vector3 (x, y, z in the right order). */
  const V = (px: number, pz: number, py: number): THREE.Vector3 => {
    const [wx, wz] = LW(px, pz);
    return new THREE.Vector3(wx, py, wz);
  };""",
        """  /** Local point + height -> world Vector3 (x, y, z in the right order). */
  const V = (px: number, pz: number, py: number): THREE.Vector3 => {
    const [wx, wz] = LW(px, pz);
    return new THREE.Vector3(wx, py, wz);
  };
  /** Same, as a spreadable [x, y, z] tuple (for b.add / b.cylinder calls). */
  const P = (px: number, pz: number, py: number): [number, number, number] => {
    const [wx, wz] = LW(px, pz);
    return [wx, py, wz];
  };""")

# stable has its own LW; add a P there too
src = src.replace(
    """  const put = (key: Parameters<StaticBuilder['box']>[0], bw: number, bh: number, bd: number,
    px: number, py: number, pz: number, rot = rotY, solid = false) => {
    const [wx, wz] = LW(px, pz);
    if (solid) b.solidBox(key, bw, bh, bd, wx, py, wz, rot);
    else b.box(key, bw, bh, bd, wx, py, wz, rot);
  };
  void c; void s;""",
    """  const put = (key: Parameters<StaticBuilder['box']>[0], bw: number, bh: number, bd: number,
    px: number, py: number, pz: number, rot = rotY, solid = false) => {
    const [wx, wz] = LW(px, pz);
    if (solid) b.solidBox(key, bw, bh, bd, wx, py, wz, rot);
    else b.box(key, bw, bh, bd, wx, py, wz, rot);
  };
  /** Local + height -> spreadable [x, y, z]. */
  const P = (px: number, pz: number, py: number): [number, number, number] => {
    const [wx, wz] = LW(px, pz);
    return [wx, py, wz];
  };
  void c; void s;""")

def balanced_find(s, start, open_ch='(', close_ch=')'):
    depth = 0
    for i in range(start, len(s)):
        if s[i] == open_ch:
            depth += 1
        elif s[i] == close_ch:
            depth -= 1
            if depth == 0:
                return i
    return -1

out = []
i = 0
count = 0
while True:
    j = src.find('...LW(', i)
    if j < 0:
        out.append(src[i:])
        break
    out.append(src[i:j])
    # args of LW(...)
    open_paren = j + len('...LW')  # position of '('
    close_paren = balanced_find(src, open_paren)
    args = src[open_paren + 1:close_paren]
    # after the LW(...) there must be ", Y" up to the next ',' or ')'
    rest = src[close_paren + 1:]
    m = re.match(r',\s*([^,()]+(?:\([^()]*\)[^,()]*)*)\s*([,)])', rest)
    if not m:
        # fallback: up to next comma at depth 0
        out.append('...LW(' + args + ')')
        i = close_paren + 1
        continue
    y = m.group(1).strip()
    term = m.group(2)
    out.append(f'...P({args}, {y})')
    if term == ',':
        out.append(', ')
        i = close_paren + 1 + m.end()
    else:
        out.append(')')
        i = close_paren + 1 + m.end()
    count += 1

new_src = ''.join(out)
open(PATH, 'w').write(new_src)
print(f'replaced {count} occurrences')
