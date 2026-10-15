#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.26.0 — THE LIVING ARMOUR: the F26 skinning rebuild fixes the three user reports on the new armour model — (1) FEET STRETCH: the tasset override reached to the ground and pinned the sabaton TOES to the pelvis (measured 81% j_root: toes frozen in world while the ankles swung — the literal 'se estiran sus pies al caminar'); gated to the skirt band (y>0.60), the feet now ride the ankle bones (88%, measured toe-to-ankle 0.207 m CONSTANT through the stride vs 0.777 before) — VLM on the live walk: 'normal rigid armored boots, not stretched, no tearing'; (2) STIFF A-POSE ARMS: the armour binds with the arms splayed 26 degrees out — measured 35 at idle; the F26 ISLAND SNAP classifies every armour plate (434 connected components) by island centroid vs the arm/leg chains (the A-pose crosses the forearms THROUGH the thigh volume — the arm chain passes 1.4 cm from the thigh's surface, no distance field could split gauntlet from cuisse; plates now ride ONE coherent chain: gauntlets->wrist, vambrace->elbow, cuisse->hip, sabatons->ankle, skirt->pelvis, helm->head) + chain-PARAM weights (position along the chain, replacing the inverse-distance-to-joint-points that put the mid upper arm 75% on the ELBOW, the vambrace 85% on j_root and the fists 73% on the KNEES — the fists used to swing with the legs, opposite the forearms) + ARMOUR_REST offsets in KnightModelGLB (the A-pose bind re-expressed into the old statue's arm hang that every F23/F24 curve and the sword grip were tuned against — idle reads 21.5/15.4 out vs 35/29 before, the armed carry at the old rig's silhouette); (3) THE SWORD: with the arm skin following the arm chain and the offsets restoring the tuned wrist frame, the uploaded greatsword now reads gripped — VLM closeup: 'handle INSIDE the armored fist, solid hammer grip, fingers curled around the hilt, no clipping', idle blade forward-up (tip 1.11 m clear), windup 'cocked back up over the shoulder, powerful', thrust 'forward along the stab line', the bow counter-rotated for the offset frame (natural ~23 cant at full draw)"
MSG_SRC="Fase 26b — v0.26.0 hotfix: bow cant top-up gated on restOffsets (bandit/villager bows were getting the armour compensation), rig_armour.ts weight rebuild (tasset y-gate, armRk y/lat gates, symmetric armOwn chain ownership, chainGeom/chainParam + ARM_W/LEG_W param weights, island-union-find classification + snap, walkSwing preview pose), dump_f26_weights/islands measuring tools, KnightModelGLB restOffsets (ARMOUR_REST) applied in apply(), bow frame counter-rotation in tuneWeaponPose, Game.ts wiring, probe_f26_diag (sword chain + arm splay + foot-skinning metrics + shot modes), F25 asset re-restore (5th sandbox re-sync loss)"

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
