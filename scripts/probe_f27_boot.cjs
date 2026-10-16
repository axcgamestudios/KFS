// probe_f27_boot.cjs — Fase 27 integration probe:
//  1. game boots, player = the FIRST knight, height ~1.95
//  2. THE RIGHT HAND EXISTS: verts near the right wrist (post-surgery) —
//     sample the skinned mesh world positions around the right wrist bone
//  3. white_concrete textures load (asset 200s) — houses get the albedo
//  4. the world banner store action exists (Elder announcement path)
//  5. LegendaryEvents wired (g.legendary present, update callable)
//  6. dragon elderboss landing logic present (fireStreak/groundCommit
//     via a spawned admin elder)
//  7. no page errors
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
  page.on('pageerror', e => { errors.push(String(e).slice(0, 300)); });
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
      if (ph === 'intro') { try { window.__kotfsApi.introSkip?.(); } catch (e) {} }
      if (ph === 'playing') break;
      await wait(400);
    }
    await wait(2500);

    const out = {};
    // --- the player model ---
    const player = g.player;
    const model = player?.model;
    out.playerH = model?.inner ? (model.inner.getWorldPosition ? null : null) : null;
    let h = 0;
    
    try {
      const b3 = new window.THREE.Box3().setFromObject(model.inner ?? model.root ?? model.group);
      h = b3.max.y - b3.min.y;
    } catch (e) { h = -1; }
    out.playerHeight = Math.round(h * 100) / 100;

    // --- the RIGHT HAND: sample skinned verts near the right wrist ---
    let handRVerts = 0, handLVerts = 0;
    try {
      const root = model.root ?? model.inner ?? model.group;
      root.updateWorldMatrix(true, true);
      let wr = null, wl = null;
      root.traverse((o) => {
        if (o.name === 'j_wristR' || o.name === 'j_wristL') {
          o.updateWorldMatrix(true, false);
          const m = o.matrixWorld.elements;
          const p = { x: m[12], y: m[13], z: m[14] };
          if (o.name === 'j_wristR' && !wr) wr = p;
          if (o.name === 'j_wristL' && !wl) wl = p;
        }
      });
      out.wristR = wr; out.wristL = wl;
      if (wr && wl) {
        root.traverse((o) => {
          if (!o.isSkinnedMesh || !o.geometry) return;
          const name = o.name || '';
          if (name !== 'knight_upper' && name !== 'knight_lower') return;
          const posAttr = o.geometry.getAttribute('position');
          for (let i = 0; i < posAttr.count; i += 7) {
            const vx = posAttr.getX(i), vy = posAttr.getY(i), vz = posAttr.getZ(i);
            // rough local->world via o.matrixWorld (bind sample; enough to
            // prove the hand GEOMETRY exists near the wrist)
            const m = o.matrixWorld.elements;
            const wx = m[0]*vx + m[4]*vy + m[8]*vz + m[12];
            const wy = m[1]*vx + m[5]*vy + m[9]*vz + m[13];
            const wz = m[2]*vx + m[6]*vy + m[10]*vz + m[14];
            const dR = Math.hypot(wx - wr.x, wy - wr.y, wz - wr.z);
            const dL = Math.hypot(wx - wl.x, wy - wl.y, wz - wl.z);
            if (dR < 0.3) handRVerts++;
            if (dL < 0.3) handLVerts++;
          }
        });
      }
    } catch (e) { out.handErr = String(e).slice(0, 120); }
    out.handRVerts = handRVerts;
    out.handLVerts = handLVerts;

    // --- white_concrete texture requests --- (network already done; check material)
    try {
      const w = g.world;
      out.concreteLoaded = !!(w && w.assets && w.assets.pbr && w.assets.pbr.white_concrete && w.assets.pbr.white_concrete.map && w.assets.pbr.white_concrete.map.image);
    } catch (e) { out.concreteLoaded = 'err'; }

    // --- store world banner ---
    try {
      const s = window.__kotfsStoreGet();
      s.setWorldBanner('test', 'sub');
      out.worldBanner = window.__kotfsStoreGet().worldBanner?.title === 'test';
      window.__kotfsStoreGet().clearWorldBanner();
    } catch (e) { out.worldBanner = String(e).slice(0, 100); }

    // --- legendary events wired ---
    out.legendary = !!g.legendary;
    try { g.legendary.update(0.016, {
      playerPos: player.position, playerAlive: true, sailing: false, ship: null, storm: false, duelStreak: 0,
    }); out.legendaryTick = true; } catch (e) { out.legendaryTick = String(e).slice(0, 140); }

    // --- the Elder Dragon def + awaken ---
    try {
      const d = g.dragons.awakenElderDragon(player.position.x + 10, player.position.z + 30);
      out.elderSpawned = !!d;
      if (d) {
        out.elderElderBoss = !!d.elderBoss;
        out.elderHp = d.hp;
      }
    } catch (e) { out.elderSpawned = String(e).slice(0, 140); }

    // --- naval legendary galleon ---
    try {
      const b = g.naval.spawnLegendaryGalleon(player.position.x + 200, player.position.z + 200, 'probe', 100, 3);
      out.galleon = !!b && b.ship.hullHp === 100;
      g.naval.fleeAmbushPirate(b);
    } catch (e) { out.galleon = String(e).slice(0, 140); }

    // --- ronin duel spawn ---
    try {
      const h2 = g.bandits.spawnLegendDuel(
        { id: 'probe_ronin', name: 'Probe Ronin', title: 't', role: 'heavy', hp: 10, damage: 5,
          x: 0, z: 0, aggroRadius: 20, chaseSpeed: 4, scale: 1, tint: { h: 0.5, s: 0.4, l: 0.2 },
          eyes: 0x48c8e8, hat: 'kasa', drops: [], lootGold: 10, xp: 10, deathFlag: 'probe_ronin_dead',
          boss: true, intro: ['a', 'b'] },
        player.position.x + 8, player.position.z + 8);
      out.roninDuel = !!h2 && h2.hp === 10;
    } catch (e) { out.roninDuel = String(e).slice(0, 140); }

    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
  process.exit(errors.length ? 2 : 0);
})();
