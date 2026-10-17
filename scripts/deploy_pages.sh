#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.27.0 — EL BESTIARIO COMÚN: the full common-enemy roster per the design doc — 15 species tiered by zone (Duende Silvestre, Kobold, Grimpote, Slime Viscoso Común near Crowhaven; Arpía, Artillero Corsario, Golem de Piedra Rúnica and the fire/shock/poison Slimes Elementales mid-island; Guardián de Escamas Dracónicas, Comandante Corsario Fantasma, Daimyo Corrupto and the Slime Corrosivo on the far peaks and outer isles; the mini-jefes Krog el Acaparador, Thorne el Guardián Caído (druid→bear at 40%) and King Slime (mitosis at 50% with a shared boss-bar pool)), every behavior and loot table of the doc, Bram's bounty-board side quest, 40 new items + Krog's club and the Espada de Gelatina in the forge tables; the early DRAGONS are level-gated (drakes Lv6, Vaelthara Lv8, Ancestro Lv12 — never from the start); the swordless-arm stretch is fixed at the rigger (rig v4: connectivity + true-hand-zone reclaim, rigid gauntlet — 0.00 mm in every pose) AND re-posed to a natural hang; the villager walk is rebuilt (speed-locked cadence, swing-only knee flexion); an adaptive resolution governor keeps high graphics rock-stable (HUD shows the live %)"
MSG_SRC="Fase 27 — v0.27.0 EL BESTIARIO COMÚN: BestiarySystem.ts (15 species + zones + loot + mini-bosses), itemsF27.ts, rig_knight.py v4 (rigid gauntlets + reclaim passes, hand rigidity 0.00mm), KnightModelGLB natural left-arm rest pose, VillagerModelGLB walk rewrite (speed-locked cadence), Engine adaptive resolution governor, DragonManager level gating, Player extern slow/root statuses, sq_bestiario + Bram dialogue trees, probe/shot/VLM tooling (probe_f27_*, shot_f27_knight, vlm_f27)"

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
