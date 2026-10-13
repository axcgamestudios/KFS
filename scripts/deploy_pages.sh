#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.20.0 — THE LENS & THE TIDE: fix assets 404ing under the /KFS base path (ASSET_BASE now page-relative; NEXT_PUBLIC_BASE_PATH was never inlined at build time so every texture/model/audio/menu image requested /game/... and silently fell back to plain colors), + FREE CAM mode on P (detached fly camera: WASD / SPACE / SHIFT, wheel speed, seamless handoff back to the hero)"
MSG_SRC="Fase 20 — v0.20.0: relative asset addressing (the GitHub Pages 404 fix: ASSET_BASE=''+document-relative URLs; CSS art url resolved via document.baseURI; next/image swapped for plain img so relative srcs survive), FREE CAM on P (CameraRig.updateFree fly step, hero idles while the lens is away, bandit/dragon aggression paused, streaming follows the lens), white_concrete PBR textures restored to the source tree"

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
