// probe_f28_boot.cjs — Fase 28 integration probe (POCIONES & EL VIAJERO):
//  1. boot clean; the MESA DE ALQUIMIA exists (interactable + collider) at
//     Maren's garden (-16,148)
//  2. EL VIAJERO: NPC present, merchant sack, relocated at day-1's stop
//     (the wreck coast, -318,190), camp props streamed nearby
//  3. ALCHEMY: 10 recipes in the catalog; craft the minor mend (mats+gold
//     granted) → potion + flag primera_pocion + quest sq_alquimia resolves
//  4. TIMED WINDOWS: fuerza → outDamageMul 1.25 + HUD strip; piel_piedra →
//     applyPlayerDamage(100 'bestiary') loses 75; masa_inerte → fallDmgMul
//     0.5; fuego oil → weaponEnchant 'burn'; antidoto → externals cleared +
//     statusImmuneLeft > 0
//  5. THE TRAVELLER'S SHOP: catalog buys ≥ 30; sell a reliquia (+260 coins);
//     buy the stardust
//  6. NEW-DAY RELOCATE: relocateTraveller(3) → stop 0 (castle crossing)
//  7. SAVE/LOAD: save with a window running → load → window survives
//  8. draw-call budget + 0 page errors + screenshots
const { chromium } = require('playwright');
const BASE = process.argv[2] ?? 'http://localhost:3000/';
const fs = require('fs');
try { fs.mkdirSync('scripts/shots_f28', { recursive: true }); } catch (e) {}

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(String(e).slice(0, 200)); });
  page.on('crash', () => console.log('[CRASH] page crashed'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 2, reflections: 0,
        postfx: false, resolution: 0.6, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    if (!g) return { fail: 'no game' };
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true }));
      }
      if (ph === 'playing') break;
      await wait(400);
    }
    const out = { phase: window.__kotfsStoreGet().phase };
    const api = window.__kotfsApi;
    const store = () => window.__kotfsStoreGet();

    // --- 1. the mesa de alquimia exists ---
    const mesa = (g.world?.interactables ?? []).find((it) => it.id === 'mesa_alquimia');
    out.mesa = mesa
      ? { x: Math.round(mesa.pos.x), z: Math.round(mesa.pos.z), prompt: mesa.prompt }
      : 'MISSING';
    out.mesaCollider = (g.world && g.colliders)
      ? (g.colliders.query(-16, 148, 3).length > 0 ? 'blocked' : 'open')
      : 'unknown';

    // --- 2. el viajero at day-1's stop ---
    const viajero = (g.npcs ?? []).find((n) => n.def.id === 'viajero');
    if (viajero) {
      out.viajero = {
        name: viajero.name,
        day: g.world.sky.dayCount,
        x: Math.round(viajero.position.x), z: Math.round(viajero.position.z),
        expectedStop: 'La Costa del Naufragio (-318, 190)',
        sack: !!viajero.model?.root?.getObjectByName
          ? (() => { let found = false; try { viajero.model.root.traverse((o) => { if (o.userData?.villagerProp) found = true; }); } catch (e) {} return found; })()
          : 'n/a',
      };
      out.viajero.atStop = Math.abs(viajero.position.x + 318) < 6 && Math.abs(viajero.position.z - 190) < 6;
    } else {
      out.viajero = 'MISSING';
    }

    // --- 3. the alchemy engine ---
    out.alchemy = 'none';
    try {
      const cat = api.alchemyCatalog();
      out.alchemy = { recipes: cat ? cat.recipes.length : 0 };
      // grant the minor-mend mats + gold and brew
      g.state.addItem('gelatina_basica', 2);
      g.state.addItem('lodo_viscoso', 1);
      g.state.addItem('coin', 100);
      const craft1 = api.alchemyCraft('r_menor');
      out.alchemy.craftMinor = craft1;
      out.alchemy.hasPotion = g.state.countItem('pocion_curacion_menor') === 1;
      out.alchemy.questFlag = g.state.hasFlag('primera_pocion');
      // the quest: grant the collect mats FIRST (they were spent on the
      // craft — a live player earns the objectives as loot, before brewing)
      g.state.addItem('lodo_viscoso', 3);
      g.state.addItem('gelatina_basica', 2);
      g.state.startQuest('sq_alquimia');
      g.state.evaluateQuests();
      const qs = g.state.questStates.get('sq_alquimia');
      out.alchemy.questDone = qs ? qs.status === 'completed' : false;
      out.alchemy.questRewards = {
        stardust: g.state.countItem('polvo_estelar'),
        minorPotions: g.state.countItem('pocion_curacion_menor'),
      };
    } catch (e) { out.alchemy = 'err:' + String(e).slice(0, 100); }

    // --- 4. the timed windows ---
    out.windows = 'none';
    try {
      // fuerza
      g.state.addItem('gelatina_maestra', 1);
      g.state.addItem('polvo_estelar', 1);
      g.state.addItem('coin', 60);
      out.windows = {};
      out.windows.fuerzaCraft = api.alchemyCraft('r_fuerza');
      api.useItem('pocion_fuerza');
      await wait(300);
      out.windows.fuerzaMul = g.combat.outDamageMul;
      // piel de piedra → the 100-damage bestiary hit lands as 75
      g.state.addItem('pocion_piel_piedra', 1);
      api.useItem('pocion_piel_piedra');
      await wait(200);
      const h0 = g.player.health;
      const lost = g.applyPlayerDamage(100, g.player.position.x + 1, g.player.position.z, 'bestiary');
      out.windows.piedra = { lost, expected: 75, ok: Math.abs(lost - 75) < 2, h0 };
      g.player.health = 100; // clean up
      // masa inerte → fall damage halved
      g.state.addItem('elixir_masa_inerte', 1);
      api.useItem('elixir_masa_inerte');
      await wait(600);
      out.windows.masaFallMul = g.player.fallDmgMul;
      out.windows.masaFallMulDirect = g.alchemy ? g.alchemy.fallAndBlastMul() : 'none';
      out.windows.staminaRegenDirect = g.alchemy ? g.alchemy.staminaRegenMul() : 'none';
      // the fire oil → the weapon edge carries burn
      g.state.addItem('gelatina_elemental', 2);
      g.state.addItem('polvora_fina', 1);
      out.windows.fuegoCraft = api.alchemyCraft('r_fuego');
      api.useItem('pocion_fuego');
      await wait(200);
      out.windows.enchant = g.alchemy ? g.alchemy.weaponEnchant() : 'none';
      // antidoto clears externals + opens the refusal window
      g.player.applyExternStatus('root', 5);
      g.state.addItem('antidoto', 1);
      api.useItem('antidoto');
      await wait(200);
      out.windows.antidoto = {
        rootedCleared: g.player.rootedT <= 0,
        immune: g.alchemy ? Math.round(g.alchemy.statusImmuneLeft() * 10) / 10 : 0,
      };
      // the full HUD strip now (all windows running; give the cadence room)
      await wait(600);
      out.windows.hudStrip = store().activeEffects.map((e) => `${e.id}:${Math.ceil(e.left)}`);
    } catch (e) { out.windows = 'err:' + String(e).slice(0, 100); }

    // --- 5. the traveller's shop ---
    out.shop = 'none';
    try {
      const cat = api.shopCatalog('viajero');
      out.shop = { buys: cat?.buys?.length ?? 0, entries: cat?.entries?.length ?? 0 };
      g.state.addItem('reliquia_marina', 1);
      const coins0 = g.state.countItem('coin');
      const sold = api.sellShopItem('viajero', 'reliquia_marina');
      out.shop.sold = sold;
      out.shop.coinsAfter = g.state.countItem('coin') - coins0;
      out.shop.reliquiaLeft = g.state.countItem('reliquia_marina');
      const coins1 = g.state.countItem('coin');
      const bought = api.buyShopItem('viajero', 'polvo_estelar');
      out.shop.bought = bought;
      out.shop.stardust = g.state.countItem('polvo_estelar');
      out.shop.coinsSpent = coins1 - g.state.countItem('coin');
    } catch (e) { out.shop = 'err:' + String(e).slice(0, 100); }

    // --- 6. new-day relocate ---
    try {
      g.relocateTraveller(3, false); // day 3 → stop 0 (castle crossing)
      await wait(300);
      const v = (g.npcs ?? []).find((n) => n.def.id === 'viajero');
      out.relocate = v
        ? { x: Math.round(v.position.x), z: Math.round(v.position.z), atStop0: Math.abs(v.position.x - 58) < 6 && Math.abs(v.position.z - 100) < 6 }
        : 'missing';
    } catch (e) { out.relocate = 'err:' + String(e).slice(0, 80); }

    // --- 7. save/load round-trip with a window running ---
    try {
      // refresh a window so something is live at save time
      g.state.addItem('pluma_arpia', 2);
      g.state.addItem('gelatina_basica', 1);
      api.alchemyCraft('r_viento');
      api.useItem('pocion_viento');
      await wait(250);
      const before = g.alchemy ? g.alchemy.serializeEffects() : [];
      out.saveLoad = { before: before.map((b) => `${b.id}:${Math.round(b.left)}`) };
      api.saveSlot(0);
      await wait(400);
      api.loadSlot(0);
      await wait(900);
      const after = g.alchemy ? g.alchemy.activeEffectsView().map((b) => `${b.id}:${Math.ceil(b.left)}`) : [];
      out.saveLoad.after = after;
      out.saveLoad.survived = after.some((a) => a.startsWith('viento:'));
    } catch (e) { out.saveLoad = 'err:' + String(e).slice(0, 100); }

    // --- 8. draw calls + wrap up ---
    try {
      g.player.teleport(-16, 3, 150); // by the mesa, facing the green
      await wait(1200);
      out.draws = g.engine.renderer.info.render.calls;
      out.triangles = g.engine.renderer.info.render.triangles;
    } catch (e) {}
    return out;
  });
  console.log(JSON.stringify(r, null, 1));

  // --- screenshots ---
  try {
    await page.evaluate(() => { window.__kotfsGame && window.__kotfsGame.player && window.__kotfsGame.player.teleport(-14, 3, 149); });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'scripts/shots_f28/mesa.png' });

    // HUD strip with three windows running (reuse whatever is live)
    await page.evaluate(() => {
      const g = window.__kotfsGame;
      if (g?.player) g.player.teleport(20, 3, 150);
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'scripts/shots_f28/hud_effects.png' });

    // the traveller at his fire (stop 0 after the relocate)
    await page.evaluate(() => {
      const g = window.__kotfsGame;
      if (g?.player) g.player.teleport(52, 3, 97);
    });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'scripts/shots_f28/viajero_camp.png' });

    // the alchemy panel open
    await page.evaluate(() => {
      window.__kotfsStoreGet().setAlchemy({ station: 'mesa' });
      window.__kotfsGame.input.releaseLock();
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'scripts/shots_f28/panel_alchemy.png' });

    // the traveller's sell tab
    await page.evaluate(() => {
      const s = window.__kotfsStoreGet();
      s.setAlchemy(null);
      s.setShop({ vendor: 'viajero', tab: 'sells' });
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'scripts/shots_f28/panel_sells.png' });
    await page.evaluate(() => window.__kotfsStoreGet().setShop(null));
  } catch (e) { console.log('[SHOTS] ' + String(e).slice(0, 120)); }

  const finalErrors = errors.filter((e) => !/ResizeObserver|WebGL|AudioContext/.test(e));
  console.log('PAGE ERRORS (' + finalErrors.length + '): ' + finalErrors.slice(0, 5).join(' | '));
  await browser.close();
  process.exit(finalErrors.length > 0 ? 1 : 0);
})();
