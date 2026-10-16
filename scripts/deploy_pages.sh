#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.27.0 - THE THREE LEGENDS: the model FINALLY has a RIGHT HAND (the statue never shipped one - the arm ended in a hollow tube and the HeroSword floated at the open wrist, the 'bug la mano': the left gauntlet was flood-filled from the wrist and MIRRORED onto the right forearm through both arm frames - 560 verts / 783 tris, re-skinned elbowL->elbowR, winding reversed; live-verified: closed armored fist with the sword handle INSIDE it, natural hammer grip, blade forward-up); the Concreto_Blanco photo PBR is back on the village houses (the white_concrete_alb/nrm/rgh set had been lost from the deploy since F25 - restored and verified in-shot: white mottled concrete + dark timber framing); no dragon MISSION from the start anymore (Jorund's Drakeling Hunter bounty now unlocks only after Aldric's 'winged shadows' talk - the dragons enter the story first); DRAGONS COME DOWN TO FIGHT: after a fire streak (1-2 breaths) every dragon lands and commits to melee for 6.5-9s (bite/claw/tail all in sword reach) before taking off - the melee window the studio asked for; THE THREE LEGENDARY EVENTS: (1) EMBOSCADA LEGENDARIA - El Rey de los Piratas: every 10 min of deep-sea sailing a 1% roll (+5% per pirate ship sunk) wakes his WAR GALLEON with elite escorts, incendiary broadsides that burn your deck and a reinforced ram - sink him for the Pirate King's Gold, Galleon Wood, his sword, his hat and the Treasure of the Seven Seas; (2) DUELO LEGENDARIO - El Ronin de la Tormenta: crossing the passes (or the open country in a storm) rolls 4% every 5 min (+10% per kill streak) - a dual-blade duelist with an IAIJUTSU traveling slash wave; at half health his steel takes the storm (+32% speed, lightning trail) - defeat him for Storm Beast Leather, the Twins of the Voracious Wind, the Storm Core, his Kasa and the Heart of the Storm; (3) DEVASTACION CELESTIAL - the ELDER DRAGON: 0.5% every 10 min at the highest summits, or sacrifice a dragon relic at the ancient altar of the Circle of Vigils (20% per minute) - she wakes with the WORLD BANNER 'El Dragon Legendario ha despertado', 2600 HP in three phases, fully CC-immune, and she LANDS to fight so a sword hero can reach her - her hoard: ancestral scales, frozen blood plates, the Claw Sword, the Dragon Heart, the Sun Essence and the 1% Crown of Primal Antlers; WALK + COMBAT reworked: pelvic yaw + knee double-flexion + ankle roll-through on the gait, and every swing now LUNGES (a real step into the cut - thrust gains 26 cm of reach) with the off-arm counterswinging for balance"
MSG_SRC="Fase 27 - v0.27.0 THE THREE LEGENDS: right-hand mirror surgery on knight_rigged.glb (surgery_f27_hand.py), white_concrete PBR restored to public/game/textures, sq_bounty gated behind aldric_dragons_talked, Dragon.ts fireStreak/groundCommitT forced landings, DragonManager elderdragon def + awakenElderDragon, BanditSystem spawnLegendDuel + DuelHandle, NavalSystem spawnLegendaryGalleon, NEW systems/LegendaryEvents.ts (the three events), gameStore+HUD worldBanner, KnightModelGLB walk (pelvic yaw / knee double-flexion / ankle roll-through) + combat lunges and off-arm counters, probe/shot tooling (probe_f27_boot.cjs, shot_f27.cjs, render/analysis scripts)"

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
