#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.26.0 — THE FIRST KNIGHT RETURNS: the player is the FIRST knight again (knight_rigged.glb — the statue rig every animation was tuned on through Fases 5-24), re-rigged with the FEET FIX: the old leg sigmoids in rig_knight.py were INVERTED so the feet rode the hip pivot with ~99% weight (a knee bend sheared the sabatons up to 64 cm — the historic stretched-feet); now the thigh follows the hip, the shin follows the knee, and every vertex below the ankle pivot is 100% rigid on its ankle bone (probe: 0.0 mm stretch in walk/knee/deep-landing poses, 595 foot verts); the statue shield it comes with is REMOVED on the player (never renders — the kit shield still appears when escudo_marea is equipped; bandits/villagers untouched); the sword is the OLD procedural HeroSword again per the studio (damascus blade, gold guard, gem pommel, forge-tier glow — perpendicular hammer grip verified on this rig: idle forward-up guard, windups cocked up-back, strikes swept forward through the target, thrust on the stab line); the uploaded longbow stays on the left hand; walk verified live (hip swing 1.52 rad, knee bend 0.96 rad, ankles arcing) and visually (upright knight posture, arms close to the body, sabatons flat and normal)"
MSG_SRC="Fase 26 — v0.26.0 THE FIRST KNIGHT RETURNS: rig_knight.py v3 (corrected leg sigmoids + RIGID SABATON clamp + widened leg regions, knight_rigged.glb regenerated), Game.ts player chain knight_rigged first + HeroSword factory + hideStatueShield, KnightModelGLB hideStatueShield dep, medieval_bow_game_model.glb restored, probe/shot tooling (probe_f26_*, shot_f26.cjs)"

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
