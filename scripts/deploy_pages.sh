#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.23.0 — THE STONECUTTER'S HAND: the village's stone roads and the fountain plaza rebuilt as hand-laid flagstone paving (every slab an individual bevelled box sunk 2-3cm and tilted to the RENDERED terrain mesh via the new TerrainSystem.meshHeight barycentric sampler — no more floating cobble boxes; per-stone random UV windows into the cobblestone photo so the pattern never repeats, per-stone weathered vertex tints with mossy/warm drifts, kerbed edges with missing-stone aging, sprawl stones blending road into grass, grid-conformed dirt joints), fountain benches/hedges/flowers each at their own terrain height on the sloped green, THE SWORD GRIP rebuilt from the fist geometry (grip centred inside the gauntlet, blade sweeping up-forward in a natural ready carry — no more floating weapon), shield re-strapped along the forearm, and the FLUIDITY pass on the knight: continuous stride cadence (no walk/run hitch), the armed arm now rides the gait instead of a frozen carry, visible idle weight shifts (hips lead, ribcage lags), per-bone settle-cascade damping (legs track, torso settles last), and the cape cloth layer live (cape bones baked into medieval_knight_rigged.glb)"
MSG_SRC="Fase 23 — v0.23.0: StonePaths.ts (flagstone roads + plaza builder), TerrainSystem.meshHeight (rendered-surface sampler — structures flush with the visible chunk tessellation at any quality), flagstone/kerb vertexColors materials wired to the cobblestone PBR set, KnightModelGLB grip/shield re-tune + cadence + living armed arm + idle weight shift + settle cascade, rig re-run with cape bones, missing knight/concrete assets restored from main"

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
