// probe_f26_boot.cjs — Fase 26 integration probe:
//  1. the player is the FIRST KNIGHT (knight_rigged.glb: knight_upper +
//     knight_lower meshes, 1.95 m, j_sword_held/j_shield_held props present)
//  2. the statue shield NEVER shows (j_shield_held.visible === false)
//  3. the sword is the OLD procedural HeroSword (hero_sword, not glb_sword)
//  4. the uploaded longbow still equips on the left hand
//  5. LIVE WALK: ankles oscillate, feet stay at ground level (no stretch-
//     sweep: bbox minY never dives), hip/knee rotation alive
//  6. no page errors
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
  page.on('console', m => { const t = m.text(); if (/\[F2[56]\]/i.test(t)) console.log('[console]', t.slice(0, 120)); });
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
    await wait(4000);

    const out = { phase: window.__kotfsStoreGet().phase };
    const press = (code, hold = 60) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })), hold);
    };
    const bboxOf = (root) => {
      let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
      root.updateMatrixWorld && root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
        const p = o.geometry.attributes.position;
        const m = o.matrixWorld.elements;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const wx = m[0]*x + m[4]*y + m[8]*z + m[12];
          const wy = m[1]*x + m[5]*y + m[9]*z + m[13];
          if (wy<mn[1])mn[1]=wy; if (wy>mx[1])mx[1]=wy;
        }
      });
      return { minY: mn[1], maxY: mx[1] };
    };
    const worldPos = (o) => { o.updateWorldMatrix?.(true, false); const m = o.matrixWorld.elements; return [m[12], m[13], m[14]]; };

    const vis = g.player?.model;
    out.visual = vis ? vis.constructor?.name : 'none';
    if (!vis) return out;

    // --- 1. the first knight: meshes + height ---
    const meshNames = [];
    vis.root.traverse((o) => { if (o.isMesh && meshNames.length < 10) meshNames.push(o.name); });
    out.meshNames = meshNames;
    out.height = +(bboxOf(vis.root).maxY - bboxOf(vis.root).minY).toFixed(3);
    out.firstKnight = meshNames.includes('knight_upper') && meshNames.includes('knight_lower');

    // --- 2. the statue shield stays hidden ---
    let shieldNode = null;
    vis.root.traverse((o) => { if (o.name === 'j_shield_held') shieldNode = o; });
    out.statueShield = { present: !!shieldNode, visible: shieldNode ? shieldNode.visible : null };
    // force wantsShield on and re-check (block stance) — the STATUE shield must stay hidden
    try { vis.setShield(true); } catch (e) {}
    out.statueShield.visibleAfterWants = shieldNode ? shieldNode.visible : null;
    try { vis.setShield(false); } catch (e) {}

    // --- 3. the old HeroSword (not the GLB greatsword) ---
    press('Digit1');
    await wait(400);
    let hero = null, glbSword = null;
    vis.root.traverse((o) => {
      if (o.userData?.heroSword) hero = o;
      if (o.userData?.glbSword || o.name === 'glb_sword') glbSword = o;
    });
    out.sword = { heroSword: !!hero, glbSword: !!glbSword, parent: hero?.parent?.name ?? null };
    if (hero) out.sword.heightM = +bboxOf(hero).maxY.toFixed(3);

    // --- 4. the uploaded longbow on the left hand ---
    try {
      g.state.addItem?.('arco_corto');
      g.combat?.switchTo?.('arco_corto');
      await wait(400);
      let bow = null;
      vis.root.traverse((o) => { if (!bow && (o.userData?.glbBow || o.name === 'glb_bow')) bow = o; });
      out.bow = { present: !!bow, parent: bow?.parent?.name ?? null };
      g.combat?.switchTo?.('espada_acero');
      await wait(300);
    } catch (e) { out.bow = { error: String(e).slice(0, 80) }; }

    // --- 5. LIVE WALK (deterministic: drive p.update with a stub input,
    //     the e2e_f20 pattern — synthetic keydowns are racy vs panels/cine) ---
    const ankR = vis.boneByName?.('j_ankleR'), ankL = vis.boneByName?.('j_ankleL');
    const hipR = vis.boneByName?.('j_hipR'), kneeR = vis.boneByName?.('j_kneeR');
    const p = g.player;
    const rig = g.rig;
    const w = g.world;
    const stub = {
      isDown: (a) => a === 'forward',
      pressed: () => false, anyPressed: () => false, menuTogglePressed: () => null,
      leftDown: false, leftPressed: false, rightDown: false, rightPressed: false,
      pointerLocked: true, mouseDX: 0, mouseDY: 0, wheelDelta: 0,
      endFrame: () => {}, clearAll: () => {},
    };
    const samples = [];
    const yaw = rig ? rig.yawForward : 0;
    const terrainH = w.terrainHeight ?? w.terrain;
    for (let i = 0; i < 90; i++) {
      p.update(1 / 30, stub, yaw, terrainH, g.colliders, false);
      if (i % 4 === 0) {
        const bb = bboxOf(vis.root);
        samples.push({
          minY: +bb.minY.toFixed(3),
          groundY: +terrainH.height(p.position.x, p.position.z).toFixed(3),
          ankRy: ankR ? +worldPos(ankR)[1].toFixed(3) : null,
          ankLy: ankL ? +worldPos(ankL)[1].toFixed(3) : null,
          hipRx: hipR ? +hipR.rotation.x.toFixed(3) : null,
          kneeRx: kneeR ? +kneeR.rotation.x.toFixed(3) : null,
        });
      }
    }
    out.walk = {
      frames: 90,
      playerSpeed: +p.speedV?.toFixed(2) || null,
      posMoved: +Math.hypot(p.position.x, p.position.z).toFixed(1),
      hipRxRange: +(Math.max(...samples.map(s => s.hipRx ?? 0)) - Math.min(...samples.map(s => s.hipRx ?? 0))).toFixed(3),
      kneeRxRange: +(Math.max(...samples.map(s => s.kneeRx ?? 0)) - Math.min(...samples.map(s => s.kneeRx ?? 0))).toFixed(3),
      ankleYRange: +(Math.max(...samples.flatMap(s => [s.ankRy ?? 0, s.ankLy ?? 0])) - Math.min(...samples.flatMap(s => [s.ankRy ?? 0, s.ankLy ?? 0]))).toFixed(3),
      // the feet-relative-to-ground gap: bbox minY minus terrain height at the
      // player — if the feet stretched/swept, minY dives far below ground
      footGapSamples: samples.map(s => +(s.minY - s.groundY).toFixed(3)).filter((_, i) => i % 3 === 0),
      samples: samples.filter((_, i) => i % 3 === 0),
    };
    out.errors = 0; // page errors tracked node-side
    return out;
  }).catch((e) => ({ fail: String(e).slice(0, 300) }));
  console.log(JSON.stringify(r, null, 1));
  console.log('PAGE ERRORS:', errors.length, errors.slice(0, 3));
  await browser.close();
})();
