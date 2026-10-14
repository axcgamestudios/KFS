#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.24.0 — THE LIVING BLADE: the sword grip reworked into a true perpendicular hammer grip (blade along the curled fingers, guard past the knuckles, pommel out the heel) with the tuned pose stored as userData.gripPose and restored EXACTLY every frame — the old baseRotX damp eroded the pitch to zero within half a second (the torch-hold read); every windup now cocks the steel UP-BACK over the shoulder and every strike sweeps it down THROUGH the target in front (the identity-axes rig used to flip the blade down-back — the literal backwards hits), the thrust finally points at the enemy for sword AND spear (wrist holds +1.7 rad along the stab line), the plunge flips the weapon into the dive, heavy re-raised through X as a headsman's windup; POSE MEMORY blends the first 90ms of every swing out of the live pose (no more one-frame teleports, combos flow), the armed arm swings with the gait, the fall keeps moving, torso counter-rotation and stride bounce grew"
MSG_SRC="Fase 24 — v0.24.0: KnightModelGLB grip rebuild (perpendicular hammer grip + gripPose restore, Euler.toArray order-string trap fixed), poseAttack wrist choreography per attack + attackWeaponPitch channel (plunge flip), AnimParams.attackDur + pose-memory blend-in, locomotion life pass (armed arm swing, torso counter, bounce, living fall), HeroSword baseRotX removed; probe tooling (probe_f24_*, shot_f24_follow live-frame-verified photography)"

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
