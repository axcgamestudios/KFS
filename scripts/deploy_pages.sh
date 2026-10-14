#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.21.0 — THE KNIGHT & THE LIGHT: the user's new medieval_knight.glb auto-rigged onto the game skeleton (cape, great helm, full plate; all procedural animations inherited + wrist follow-through, idle glances, attack whip-cracks), FIRST PERSON mode on B (eye-level lens, head bone collapses, body visible looking down, FPS-style facing), realistic SUN SHAFTS on high (analytic crepuscular rays through the postfx chain), sea retuned to the menu key art (navy-slate deep, steel-teal shallows, heavier opacity), DPR-correct resolution (fixes the pixelated camera), shadows tightened (frustum 55m, bias fix, stronger contrast), mountains with real crest lines + dithered snow, bigger natural cumulus, faceted strata boulders, an 8-road dirt trail network between locations, white-concrete PBR from the user photo, + major 60fps work: terrain LOD + time-sliced chunk/grass/cluster building, boot pregeneration, the 2000-draw-call Great Maple merged (5473→1625 calls), steady-state JS p95 70ms→2ms"
MSG_SRC="Fase 21 — v0.21.0: new knight (scripts/rig_knight.ts auto-rigger: landmarks→15-bone skeleton→region-masked smooth weights→manual GLB writer with compact attributes), FP on B, analytic sun shafts, sea/sky/mountain/cloud/rock/road visual pass, DPR-correct resolution, shadow tuning, terrain chunk LOD + time-sliced streaming, boot pregeneration + grass prefill, Great Maple merge, photo-based white_concrete PBR"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "== site -> main =="
git clone -q --depth 1 -b main "$ORIGIN" "$WORK/site"
rsync -a --delete --exclude '.git' --exclude '.nojekyll' out/ "$WORK/site/"
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
