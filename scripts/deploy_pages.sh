#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.25.0 — THE ARMOURY: the player becomes the studio's new lightweight armour model (medieval_knight_armour.glb, A-pose, 9.3k verts — auto-rigged onto the 15-bone skeleton + cape chain by scripts/rig_armour.ts: full plate with great helm, tassets pinned to the pelvis, a built crimson cape skinned to the spring-damper cloth bones; 1.28 MB vs the old 10.7), the hero's steel is the uploaded medieval_sword.glb greatsword (grip-normalized: 0.93 m of blade above the fist, perpendicular hammer grip, forge-tier glow preserved and grows per tier — and the scale never erodes again: tier scaling now MULTIPLIES the weapon base scale) and the uploaded medieval_bow_game_model.glb longbow rides the left hand with the string facing the archer; every attack verified direction-correct on the new rig (idle forward-up guard, windups cocked back-up over the shoulder, strikes swept down through the target, thrust on the stab line, walk with living sword arm and flowing cape); Crowhaven's cottage walls now wear the Concreto_Blanco photo PBR (white concrete + dark timber framing); HOW TO PLAY ships in the main menu AND the pause menu — every control and combination (movement, 4-hit combos, heavy charge, air juggle/plunge, parry, hook dash, rope dart, finisher, tonic, bow aim/arrows/specials, first person on B, free cam on P, all screens, horse whistle, full sailing) with forged key chips; FIRST PERSON verified live (B: camera at eye height 1.70, helm hidden, badge on)"
MSG_SRC="Fase 25 — v0.25.0: rig_armour.ts (A-pose armour auto-rigger + cape mesh builder + 2-mesh GLB writer), GlbWeapons.ts (uploaded sword/bow normalizers), Game.ts model swap + weapon factory, KnightModelGLB baseScale tier fix + element glow, BritishVillage concreteWhite walls, MainMenu HowToPlay + PauseMenu controles tab, deploy preserves root uploads, probe/shot tooling (probe_f25_*, shot_f25.cjs)"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "== site -> main =="
git clone -q --depth 1 -b main "$ORIGIN" "$WORK/site"
# F25 — PRESERVE the studio's uploads at the repo root (the GLB models the
# team pushes via the GitHub web UI): rsync --delete must never remove them.
mkdir -p "$WORK/keep"
find "$WORK/site" -maxdepth 1 -type f \( -name '*.glb' -o -name '*.JPG' -o -name '*.jpg' -o -name '*.png' \) -exec cp -a {} "$WORK/keep/" \; || true
rsync -a --delete --exclude '.git' --exclude '.nojekyll' out/ "$WORK/site/"
cp -a "$WORK/keep/." "$WORK/site/" 2>/dev/null || true
touch "$WORK/site/.nojekyll"
git -C "$WORK/site" add -A
git -C "$WORK/site" commit -q -m "$MSG_SITE" || { echo "nothing to commit on main?"; exit 1; }
git -C "$WORK/site" push -q origin main
echo "   main: $(git -C "$WORK/site" rev-parse --short HEAD)"

echo "== source -> game-source =="
git clone -q --depth 1 -b game-source "$ORIGIN" "$WORK/src"
rsync -a \
  --exclude '.git' --exclude 'node_modules' --exclude '.next' --exclude 'out' \
  --exclude 'skills' --exclude 'kfs.tar.gz' --exclude 'dev.log' \
  --exclude '.zscripts' --exclude 'tsconfig.tsbuildinfo' \
  /home/z/my-project/ "$WORK/src/"
git -C "$WORK/src" add -A
git -C "$WORK/src" commit -q -m "$MSG_SRC" || { echo "nothing to commit on game-source?"; exit 1; }
git -C "$WORK/src" push -q origin game-source
echo "   game-source: $(git -C "$WORK/src" rev-parse --short HEAD)"

echo "== deployed =="
