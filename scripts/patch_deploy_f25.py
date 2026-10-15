#!/usr/bin/env python3
# patch_deploy_f25.py — update deploy_pages.sh for Fase 25
p = 'scripts/deploy_pages.sh'
src = open(p).read()

old = """echo "== site -> main =="
git clone -q --depth 1 -b main "$ORIGIN" "$WORK/site"
rsync -a --delete --exclude '.git' --exclude '.nojekyll' out/ "$WORK/site/"
touch "$WORK/site/.nojekyll\""""
new = """echo "== site -> main =="
git clone -q --depth 1 -b main "$ORIGIN" "$WORK/site"
# F25 — PRESERVE the studio's uploads at the repo root (the GLB models the
# team pushes via the GitHub web UI): rsync --delete must never remove them.
mkdir -p "$WORK/keep"
find "$WORK/site" -maxdepth 1 -type f \\( -name '*.glb' -o -name '*.JPG' -o -name '*.jpg' -o -name '*.png' \\) -exec cp -a {} "$WORK/keep/" \\; || true
rsync -a --delete --exclude '.git' --exclude '.nojekyll' out/ "$WORK/site/"
cp -a "$WORK/keep/." "$WORK/site/" 2>/dev/null || true
touch "$WORK/site/.nojekyll\""""
assert old in src, 'rsync pattern not found'
src = src.replace(old, new)

import re
msg_site = re.search(r'MSG_SITE="([^"]*)"', src, re.S).group(1)
msg_src = re.search(r'MSG_SRC="([^"]*)"', src, re.S).group(1)

new_site = ("v0.25.0 — THE ARMOURY: the player becomes the studio's new lightweight armour model "
  "(medieval_knight_armour.glb, A-pose, 9.3k verts — auto-rigged onto the 15-bone skeleton + cape chain by "
  "scripts/rig_armour.ts: full plate with great helm, tassets pinned to the pelvis, a built crimson cape "
  "skinned to the spring-damper cloth bones; 1.28 MB vs the old 10.7), the hero's steel is the uploaded "
  "medieval_sword.glb greatsword (grip-normalized: 0.93 m of blade above the fist, perpendicular hammer grip, "
  "forge-tier glow preserved and grows per tier — and the scale never erodes again: tier scaling now "
  "MULTIPLIES the weapon base scale) and the uploaded medieval_bow_game_model.glb longbow rides the left "
  "hand with the string facing the archer; every attack verified direction-correct on the new rig (idle "
  "forward-up guard, windups cocked back-up over the shoulder, strikes swept down through the target, "
  "thrust on the stab line, walk with living sword arm and flowing cape); Crowhaven's cottage walls now wear "
  "the Concreto_Blanco photo PBR (white concrete + dark timber framing); HOW TO PLAY ships in the main menu "
  "AND the pause menu — every control and combination (movement, 4-hit combos, heavy charge, air "
  "juggle/plunge, parry, hook dash, rope dart, finisher, tonic, bow aim/arrows/specials, first person on B, "
  "free cam on P, all screens, horse whistle, full sailing) with forged key chips; FIRST PERSON verified "
  "live (B: camera at eye height 1.70, helm hidden, badge on)")
new_srcmsg = ("Fase 25 — v0.25.0: rig_armour.ts (A-pose armour auto-rigger + cape mesh builder + 2-mesh GLB "
  "writer), GlbWeapons.ts (uploaded sword/bow normalizers), Game.ts model swap + weapon factory, "
  "KnightModelGLB baseScale tier fix + element glow, BritishVillage concreteWhite walls, MainMenu HowToPlay "
  "+ PauseMenu controles tab, deploy preserves root uploads, probe/shot tooling (probe_f25_*, shot_f25.cjs)")

src = src.replace('MSG_SITE="' + msg_site + '"', 'MSG_SITE="' + new_site + '"')
src = src.replace('MSG_SRC="' + msg_src + '"', 'MSG_SRC="' + new_srcmsg + '"')
open(p, 'w').write(src)
print('deploy script patched OK')
