#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.27.0 — THE KNIGHTLY GAIT: the F27 walk rebuild answers the user report (separate parts / no sword / weird walk with arms too open / must walk like a knight) — (1) SWORD: the uploaded greatsword GLB is retired; the master-forged procedural HERO SWORD returns to the right hand (user call: usa el que teniamos), forge tiers + elemental runes intact, verified in-hand at spawn; (2) ARMS TOO OPEN: ARMOUR_REST shoulder z 0.23 to 0.40 rotates the whole arm-sword assembly into a courtly hang — measured idle splay 10/9 deg (was 18/20), walk peaks 10-15 deg (was 26-31); (3) WEIRD WALK: the ankle channel was INVERTED since F12 (toes DOWN at heel strike, UP at toe-off — the literal backwards foot); now heel-first landing (toes up), flat stance, plantarflexed toe-off, verified numerically across the full stride cycle; the gait is knightly-composed — blade arm in a STILL low carry (no pumping), free arm modest, torso tall, head steady, measured bounce/sway halved, charge trail softened without shield; (4) SEPARATE PARTS: 12 tapered steel articulation collars ride the parent side of every joint (shoulders/elbows/wrists/hips/knees/ankles) cloned from the body PBR — VLM: armor connects coherently, no floating segments, no visible gaps at the knees; (5) THRUST re-aligned after the rest change: elbow-z counter-rotation straightens the forearm onto the stab line (blade dir dead forward, was 40 deg off-axis)"
MSG_SRC="Fase 27 — v0.27.0 THE KNIGHTLY GAIT: Game.ts sword factory reverted to buildHeroSword (uploaded greatsword retired, longbow stays), armourRig dep + addArmourJointCollars (12 laminate collars) in KnightModelGLB, ARMOUR_REST shoulder z 0.40, knightly locomotion rewrite (arms/torso/head/bounce/ankle-inversion fix), thrust elbow-z counter-rotation, f27_pose_harness.cjs (deterministic pose driver + synchronous render — SwiftShader runs the full world at 1 frame per 3s and the F26 walk verification data was FROZEN; the harness drives m.update directly and renders only the knight), probe_f25_boot sword detection extended to hero_sword"

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
