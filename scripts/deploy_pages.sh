#!/bin/bash
# deploy_pages.sh — Fase 20: push the static site to `main` and the source
# tree to `game-source` on axcgamestudios/KFS.
# The site branch must mirror out/ EXACTLY (rsync --delete), the source
# branch is an additive full-tree sync (node_modules/.next/out/skills and
# transient files excluded).
set -euo pipefail
cd /home/z/my-project

ORIGIN=$(git remote get-url origin)
MSG_SITE="v0.28.0 — POCIONES & EL VIAJERO: the alchemist's economy and the wandering merchant — LA MESA DE ALQUIMIA at Maren's garden (10 brews: curación menor/mayor, antídoto, viento, piel de piedra, regeneración, aceite ponzoñoso, aceite ígneo, fuerza del coloso, elixir de masa inerte) driven by a full AlchemySystem of timed windows (damage out +25%, damage taken −25%, stride +15%, breath +40%, regen +3 HP/s, falls & blasts halved, bestiary DoT edge oils, the antidote's 8s refusal) composed into the live systems (roar+potion out-multiplier, takeHit, stamina, stride), shown on a HUD chip strip, and persisted in the save; EL VIAJERO walks the old trade circuit (castle crossing / wreck coast / sanctuary stones, dayCount % 3, relocated at dawn + after load, settle 1.6m south of the fire) with three permanent camps (fire ring, bedroll, lashed trade crate, banner post) — his shop carries the road's rarities (stardust, the Errant's Tea) and HIS BUYS tab finally gives the island a sell side: 35 buyers' entries at honest prices, treasures and bestiary junk alike; two side quests (sq_alquimia — prove the table; sq_viajero — Tom's regards); audio 'brew'; VLM-verified"
MSG_SRC="Fase 28 — v0.28.0 POCIONES & EL VIAJERO: AlchemySystem.ts + alchemyRecipes.ts + itemsF28.ts (12 items), structures/AlchemyStation.ts + TravellerCamp.ts (3 camps), shops.ts VendorDef.buys + vendor 'viajero', dialoguesF28.ts (viajero/maren/tom grafts), questsF28.ts (sq_alquimia + sq_viajero), Game.ts wiring (damageBandit edge oils, playerStatus antidoto refusal, applyPlayerDamage windows, outDamageMul roar×potion composition, new-day relocate, save buffs), Player.ts fallDmgMul/potionSpeedMul/externStaminaMul, NPC.relocate(), DialogueSystem shop tab, api.ts alchemyCatalog/sellShopItem, gameStore alchemy/activeEffects, AlchemyUI/ShopUI tabs/HUD strip, probe_f28_boot/prod + shot/vlm tooling"

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
