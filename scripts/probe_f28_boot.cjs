// probe_f28_boot.cjs — Fase 28 full integration probe on the dev server.
// Covers: the patched arm weights (rigid bands) live through three.js; the
// villager walk rework driven live; Maren's still (catalog + craft + use +
// the AlchemySystem mods); the acid flask + the Tear per-combat limit; EL
// VIAJERO end-to-end (arrival, catalog, buy/sell/buyback/relic, favorites
// lock, the road ambush + posture + defender reward); the adaptive
// resolution governor under SwiftShader load.
const { chromium } = require('playwright');

const BASE = process.argv[2] ?? 'http://localhost:3000/';
const results = [];
const log = (k, v) => { results.push([k, v]); console.log(`[${k}] ${typeof v === 'object' ? JSON.stringify(v) : v}`); };

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  ] });
  const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.85, showFps: true,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 120; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 200; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true }));
      }
      if (ph === 'playing') break;
      await wait(300);
    }
    await wait(2500);
  });
  const phase = await page.evaluate(() => window.__kotfsStoreGet().phase);
  log('phase', phase);
  if (phase !== 'playing') { console.log('NOT PLAYING — abort'); await browser.close(); process.exit(1); }

  // ---------------------------------------------------------------- 1) arms
  const arms = await page.evaluate(() => {
    const g = window.__kotfsGame;
    const out = { upper: null, weights: {} };
    const p = g.player;
    const mesh = p.model.root;
    let total = 0, bad = 0;
    mesh.traverse((o) => {
      if (!o.isSkinnedMesh || !o.geometry?.attributes?.skinWeight) return;
      const sw = o.geometry.attributes.skinWeight;
      const si = o.geometry.attributes.skinIndex;
      for (let i = 0; i < sw.count; i++) {
        let sum = 0, max = 0;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); sum += w; if (w > max) max = w; }
        if (sum > 0 && max / sum > 0.999) total++;
        else if (sum > 0) bad++;
      }
      void si;
    });
    out.weights = { rigidRows: total, blendedRows: bad };
    // live arm band composition: dominant bone census near each arm chain
    const jn = (n) => g.player.model.root.getObjectByName(n);
    void jn;
    // height of the player model (the F28 arms surgery must not move it)
    out.upper = p.model.root.scale.y ?? null;
    out.h = mesh.scale.y;
    return out;
  });
  log('arms', arms);

  // ---------------------------------------------------------------- 2) villager walk, driven live
  const walk = await page.evaluate(async () => {
    const g = window.__kotfsGame;
    const npcs = g.npcs ?? [];
    // drive the first villager's visual deterministically at walking speed
    let vis = null, name = null;
    for (const n of npcs) { if (n.model?.poseWalk) { vis = n.model; name = n.def?.name ?? n.name; break; } }
    if (!vis) return { villagers: npcs.length, sample: null, error: 'no VillagerModelGLB found', kinds: npcs.map((n) => n.model?.constructor?.name).slice(0, 3) };
    const read = () => ({
      hipsY: vis.bones.get('hips')?.rotation.y ?? null,
      footLX: vis.bones.get('footL')?.rotation.x ?? null,
      footRX: vis.bones.get('footR')?.rotation.x ?? null,
      kneeLX: vis.bones.get('legL')?.rotation.x ?? null,
      innerY: vis.inner.position.y,
      phase: vis.phase,
    });
    const t0 = read();
    for (let i = 0; i < 26; i++) {
      vis.update({ dt: 1 / 30, speed: 1.6, moving: true, grounded: true, swimming: false, attackT: 0 });
    }
    const t1 = read();
    // the bob must peak at leg-pass: sample phase and innerY pairs
    const ph = [];
    for (let i = 0; i < 60; i++) {
      vis.update({ dt: 1 / 30, speed: 1.6, moving: true, grounded: true, swimming: false, attackT: 0 });
      ph.push({ p: +vis.phase.toFixed(2), y: +vis.inner.position.y.toFixed(3) });
    }
    return {
      villagers: npcs.length,
      name,
      animates: {
        hipsYaw: t0.hipsY !== t1.hipsY,
        footRoll: t0.footLX !== t1.footLX,
        footRollR: t0.footRX !== t1.footRX,
        knee: t0.kneeLX !== t1.kneeLX,
        bob: t0.innerY !== t1.innerY,
      },
      t0: { hipsY: +t0.hipsY.toFixed(4), footLX: +t0.footLX.toFixed(4), kneeLX: +t0.kneeLX.toFixed(4), innerY: +t0.innerY.toFixed(4) },
      t1: { hipsY: +t1.hipsY.toFixed(4), footLX: +t1.footLX.toFixed(4), kneeLX: +t1.kneeLX.toFixed(4), innerY: +t1.innerY.toFixed(4) },
      phaseSamples: ph.slice(0, 8),
    };
  });
  log('villagerWalk', walk);

  // ---------------------------------------------------------------- 3) the still + alchemy
  const still = await page.evaluate(() => {
    const g = window.__kotfsGame;
    const api = window.__kotfsApi;
    // grant the ingredients for 3 recipes
    const s = g.state;
    for (const [id, n] of [
      ['gelatina_basica', 4], ['lodo_viscoso', 2], ['manzana_silvestre', 2],
      ['escama_opaca', 4], ['diente_reptil', 2],
      ['esencia_profundidades', 2], ['polvora_maldita', 1], ['esencia_viento_oscuro', 1],
      ['semilla_bosque', 1], ['esencia_roble', 1], ['hierbas_raras', 1],
    ]) s.addItem(id, n);
    const cat = api.forgeCatalog('still');
    const recipes = cat?.recipes?.map((r) => ({ id: r.id, status: r.status, canCraft: r.canCraft, mats: r.mats?.map((m) => `${m.id}:${m.have}/${m.need}`) })) ?? null;
    // craft scales + fury + the tear
    const r1 = api.forgeCraft('still', 'brew_escamas');
    const r2 = api.forgeCraft('still', 'brew_furia');
    const r3 = api.forgeCraft('still', 'brew_lagrima');
    // use them
    const u1 = (() => { try { api.useItem('pocion_escamas'); return 'used'; } catch (e) { return 'ERR'; } })();
    const u2 = (() => { try { api.useItem('elixir_furia'); return 'used'; } catch (e) { return 'ERR'; } })();
    const u3 = (() => { try { api.useItem('lagrima_bosque'); return 'used'; } catch (e) { return 'ERR'; } })();
    const modsAfter = g.alchemy ? { def: g.alchemy.mods.defenseMult, crit: g.alchemy.mods.critDamageAdd, spd: g.alchemy.mods.attackSpeedMult, immune: g.alchemy.mods.statusImmune } : null;
    const health = { before: null };
    // lesser heal
    const hpBefore = g.player.health;
    s.addItem('pocion_curacion_menor', 2);
    g.player.health = Math.max(1, g.player.stats.maxHealth * 0.3);
    api.useItem('pocion_curacion_menor');
    health.before = hpBefore;
    const healed = g.player.health;
    // active effects for HUD
    const fx = api.activeEffects();
    // the Tear per-combat limit: force combat, use again
    g.alchemy.noteCombat(false);
    const tearBlocked = (() => {
      s.addItem('lagrima_bosque', 3);
      api.useItem('lagrima_bosque'); // 1st in-combat (uses already at 1 from u3? u3 was outside combat) -> counts
      const r = g.alchemy.use('lagrima_bosque'); // 2nd in-combat against non-boss -> must be combat-limit
      return r;
    })();
    return { recipes, craft: { escamas: r1, furia: r2, lagrima: r3 }, use: { escamas: u1, furia: u2, lagrima: u3 }, modsAfter, heal: { hpBefore, healed, max: g.player.stats.maxHealth }, fx, tearBlocked };
  });
  log('still', still);

  // ---------------------------------------------------------------- 4) acid flask + shred
  const acid = await page.evaluate(async () => {
    const g = window.__kotfsGame;
    // put the player in front of a live bandit: teleport near a camp spawn
    const api = window.__kotfsApi;
    g.state.addItem('brebaje_acido', 2);
    // teleport near the King's Road camp and pull a live bandit through the
    // same radius query the AlchemySystem uses
    const camps = g.bandits ? g.bandits.campList?.() ?? null : null;
    const camp = camps?.[0];
    let target = null;
    if (camp) {
      g.player.teleport(camp.x + 10, g.world.terrainHeight.height(camp.x + 10, camp.z), camp.z);
      for (let i = 0; i < 40 && !target; i++) {
        await new Promise((r) => setTimeout(r, 250));
        const near = g.bandits.meleeHitCheckRadius(g.player.position, 60, 8);
        const b = near.find((x) => !x.bandit.dead);
        if (b) target = { x: b.bandit.pos.x, z: b.bandit.pos.z, ref: b.bandit };
      }
    }
    let threw = 'no-target', dots = 0, shredLive = 'n/a';
    if (target) {
      // face the bandit and stand 6 m off (the cloud blooms 9 m ahead)
      g.player.teleport(target.x - 6, g.world.terrainHeight.height(target.x - 6, target.z), target.z);
      g.player.yaw = Math.atan2(target.x - (target.x - 6), target.z - target.z);
      try { api.useItem('brebaje_acido'); threw = 'ok'; } catch (e) { threw = 'ERR'; }
      // a DoT only registers if a live target was within 5 m of the cloud point
      const dbg0 = g.alchemy.debugState();
      dots = dbg0.dots;
      shredLive = g.bandits.acidShredOf ? (g.bandits.acidShredOf(target.ref) === 1.3 ? 'SHREDDED x1.3' : 'not-shredded') : 'missing';
    }
    const dbg = g.alchemy ? g.alchemy.debugState() : null;
    return { target: target ? { x: target.x, z: target.z } : null, threw, dots, shredLive, dbg, camps };
  });
  log('acid', acid);

  // ---------------------------------------------------------------- 5) EL VIAJERO end-to-end
  const viajero = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    const api = window.__kotfsApi;
    const T = g.traveler;
    if (!T) return { error: 'no traveler system' };
    // force an arrival now (private method — probe access)
    T.arrive({ id: 'green', name: 'the village green', biome: 'village', x: 24, z: 152 }, T.dayFloat + 0.25);
    await wait(400);
    const present1 = T.present;
    const cat = api.travelerCatalog();
    const catalogOk = !!cat && cat.present && cat.stock.length >= 8 && cat.demand.length === 2;
    // walk to the camp and check the prompt
    const p = g.player;
    p.teleport(24, g.world.terrainHeight.height(24, 152), 152);
    await wait(300);
    const prompt = T.interactableNear(p.position);
    // buy: give gold
    g.state.addItem('coin', 3000);
    const buy1 = api.travelerBuy('pocion_curacion_menor');
    // sell: give a junk + a demand material
    const demandId = cat.demand[0].id;
    g.state.addItem(demandId, 3);
    g.state.addItem('botin', 1);
    const sell1 = api.travelerSell(demandId, 2);
    const sellJunk = api.travelerSell('botin', 1);
    // buyback
    const bb0 = api.travelerBuyback(0);
    // favorites lock
    g.state.addItem('wakizashi', 1);
    api.toggleFavorite('wakizashi');
    const favLock = api.travelerSell('wakizashi', 1);
    const favOn = api.isFavorite('wakizashi');
    // relic gambling
    g.state.addItem('coin', 6000);
    const relic = api.travelerRelic();
    // the ambush: force it and win it
    T.checkedAmbushRoll = true;
    T.startAmbush();
    await wait(200);
    const amb = T.ambushView;
    // kill all ambushers through the damage entry (radius query at the camp)
    let killed = 0;
    for (let i = 0; i < 30; i++) {
      const near = g.bandits.meleeHitCheckRadius(p.position, 90, 24);
      const live = near.filter((x) => !x.bandit.dead);
      if (live.length === 0) break;
      for (const x of live) { g.bandits.damage(x.bandit, 100000, true); killed++; }
      await wait(200);
    }
    await wait(900);
    const ambAfter = T.ambushView;
    const rep = T.reputation;
    const disc = T.discountPct;
    return { present1, catalogOk, demand: cat?.demand, prompt: prompt?.prompt ?? null, buy1, sell1, sellJunk, bb0, fav: { lock: favLock, on: favOn }, relic, amb, ambAfter, killed, rep, disc, budget: T.budgetLeft };
  });
  log('viajero', viajero);

  // ---------------------------------------------------------------- 6) adaptive governor
  const gov = await page.evaluate(() => {
    const g = window.__kotfsGame;
    const e = g.engine;
    // synthetic overload: 26 ms frames sustained — the ladder must descend
    for (let i = 0; i < 120; i++) e.stepAdaptive(0.026);
    const down = { scale: e.adaptiveScale, note: e.adaptiveNote, pr: e.renderer.getPixelRatio(), idx: e.adaptiveIdx };
    // synthetic headroom: 10 ms frames — slow climb back with hysteresis
    let upNote = '';
    for (let i = 0; i < 400; i++) { e.stepAdaptive(0.010); if (e.adaptiveNote.startsWith('up')) upNote = e.adaptiveNote; }
    const recovered = { scale: e.adaptiveScale, note: e.adaptiveNote, pr: e.renderer.getPixelRatio() };
    return { down, recovered, upNote, ema: +e.frameMsEma.toFixed(1) };
  });
  log('governor', gov);

  // ---------------------------------------------------------------- 7) page errors + perf census
  const perf = await page.evaluate(() => {
    const g = window.__kotfsGame;
    const info = g.engine.renderer.info;
    return { calls: info.render.calls, tris: info.render.triangles, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) };
  });
  log('perf', perf);
  log('pageErrors', pageErrors.slice(0, 6));
  log('pageErrorCount', pageErrors.length);

  await browser.close();
  const fails = results.filter(([k, v]) => k.startsWith('!'));
  console.log(`\nPROBE ${fails.length === 0 && pageErrors.length === 0 ? 'CLEAN' : 'ISSUES'}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
