// probe_f27_boot.cjs — Fase 27 integration probe:
//  1. boot clean, knight model intact (F26 regression: knight_upper/lower)
//  2. VILLAGER WALK: cadence scales with speed (the rewrite) — sample the
//     UpLeg swing period at stroll vs hurry, expect faster at hurry
//  3. BESTIARY: teleport to the goblin zone (95, 95) → 3 Duendes stream in,
//     species correct; kill one → XP + kill counter + Bram's bounty flag
//  4. DRAGON GATING: Vaelthara ABSENT at level 1; after level 8 + the 2 s
//     poll → spawned (no dragons from the start)
//  5. GOVERNOR: engine.resolutionScale exists (1.0 at rest)
//  6. draw-call budget + 0 page errors
const { chromium } = require('playwright');
const BASE = process.argv[2] ?? 'http://localhost:3000/';

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

    // --- 1. knight intact (F26 regression; wait for the GLB model swap) ---
    let vis = null, meshNames = [];
    for (let i = 0; i < 120; i++) {
      vis = g.player?.model;
      meshNames = [];
      if (vis) vis.root.traverse((o) => { if (o.isMesh) meshNames.push(o.name); });
      if (meshNames.includes('knight_upper')) break;
      await wait(500);
    }
    out.knight = meshNames.includes('knight_upper') && meshNames.includes('knight_lower');

    // --- 2. villager walk cadence scales with speed (F27 rewrite) ---
    out.villager = 'none-found';
    try {
      let villagerModel = null;
      // the fuse_civilian GLB builds async — wait for the bones to bind
      for (let i = 0; i < 60 && !villagerModel; i++) {
        for (const npc of g.npcs ?? []) {
          const m = npc.model ?? npc.visual;
          if (m && m.constructor?.name === 'VillagerModelGLB'
              && m.root && m.root.getObjectByName('mixamorigRightUpLeg_049')
              && m.root.getObjectByName('mixamorigLeftUpLeg_045')) {
            villagerModel = m; break;
          }
        }
        if (!villagerModel) await wait(500);
      }
      if (villagerModel) {
        const legR = villagerModel.root.getObjectByName('mixamorigRightUpLeg_049');
        const legL = villagerModel.root.getObjectByName('mixamorigLeftUpLeg_045');
        if (legR && legL) {
          // walk in place at two speeds; count X-rotation zero-crossings
          const run = (speed, frames) => {
            let prev = 0, crosses = 0;
            for (let i = 0; i < frames; i++) {
              villagerModel.update({ dt: 1 / 30, speed, moving: true, grounded: true, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1, vy: 0, yawRate: 0 });
              const v = legR.rotation.x;
              if (i > 0 && ((prev < 0 && v >= 0) || (prev > 0 && v <= 0))) crosses++;
              prev = v;
            }
            return crosses;
          };
          // warm up (speedSm damp)
          run(1.15, 60);
          const cStroll = run(1.15, 240);
          run(3.0, 60);
          const cHurry = run(3.0, 240);
          out.villager = { cStroll, cHurry, faster: cHurry > cStroll };
        } else {
          out.villager = 'bones-missing';
        }
      }
    } catch (e) { out.villager = 'err:' + String(e).slice(0, 60); }

    // --- 3. bestiary: stream in + kill ---
    out.bestiary = 'none';
    try {
      g.player.teleport(95, 2, 95);
      await wait(1400);
      const list = g.bestiary ? g.bestiary.list() : [];
      out.bestiary = { streamed: list.length };
      if (list.length > 0) {
        out.bestiary.species = g.bestiary.speciesOf(list[0]).id;
        out.bestiary.alive = list.filter((c) => c.alive !== false && c.state !== 'dead').length;
        const xpBefore = g.state.xp;
        const c0 = list[0];
        g.bestiary.damage(c0, 9999, { heavy: true, fromX: 90, fromZ: 90 });
        await wait(300);
        out.bestiary.killed = c0.state === 'dead';
        out.bestiary.xpGain = g.state.xp - xpBefore;
        out.bestiary.killCounter = g.state.killCounters?.['creature_duende'] ?? 0;
        out.bestiary.bountyFlag = g.state.hasFlag('bestiario_board');
        out.bestiary.loot = {
          garrote: g.state.countItem('garrote_mellado'),
          chatarra: g.state.countItem('chatarra_hierro'),
        };
      }
    } catch (e) { out.bestiary = 'err:' + String(e).slice(0, 80); }

    // --- 4. dragon gating ---
    try {
      out.dragonGate = {
        level: g.state.level,
        vaeltharaAtL1: !!g.dragons.dragonById('vaelthara'),
        drakeAtL1: !!g.dragons.dragonById('drake_stones'),
      };
      g.state.level = 9;
      g.state.xp = 2000;
      // the Game poll fires every 2 s of GAME time (SwiftShader: ~20 s real);
      // drive the same public API the poll calls — this is the poll's body
      g.dragons.setProgress(9, () => false);
      await wait(800);
      out.dragonGate.vaeltharaAtL9 = !!g.dragons.dragonById('vaelthara');
      out.dragonGate.drakeAtL9 = !!g.dragons.dragonById('drake_stones');
    } catch (e) { out.dragonGate = 'err:' + String(e).slice(0, 80); }

    // --- 5. governor ---
    out.governor = typeof g.engine.resolutionScale === 'number' ? g.engine.resolutionScale : 'missing';

    // --- 6. draw calls ---
    out.drawCalls = g.engine.renderer.info.render.calls;

    return out;
  }).catch((e) => ({ fail: String(e).slice(0, 300) }));

  console.log(JSON.stringify(r, null, 1));
  console.log('pageErrors:', errors.length, errors.slice(0, 4));
  await browser.close();
  const bad = errors.length > 0 || r.fail || (r.bestiary && typeof r.bestiary === 'object' && r.bestiary.streamed === 0);
  process.exit(bad ? 1 : 0);
})();
