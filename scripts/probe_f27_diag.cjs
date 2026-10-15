// probe_f27_diag.cjs — Fase 27 diagnosis of the user report:
//   "tiene como partes separadas el modelo, no viene con la espada, mejor no
//    uses el glb de la espada, usa el que teniamos. camina muy raro el
//    jugador, sus brazos como muy abiertos, debe de caminar como caballero"
//
// ENV TRUTH (measured this fase): SwiftShader renders the full world at
// ~1 frame / 1-2 s — the game loop barely advances inside a probe window
// (the F26 walk series was FROZEN: identical pos/speed every sample — its
// "verified walk" data was static). FIX: ISOLATE THE KNIGHT — hide every
// scene child except the player group + lights + sky, so SwiftShader runs
// the real animation loop at full speed. The animation layer doesn't care
// what else is visible.
//
// Measures (live, authentic animation path):
//   A. ARM SPLAY at idle + walking (the "brazos muy abiertos" complaint)
//   B. SWORD in hand at spawn (name/type — which factory built it)
//   C. Screenshots: walk_front / walk_side / idle_3q / plates_arm / plates_knee
// Usage: node probe_f27_diag.cjs [data|shot:all|shot:walk|shot:idle|shot:plates]
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f27';
fs.mkdirSync(OUT, { recursive: true });
const mode = process.argv[2] ?? 'data';
const BASE = process.argv[3] ?? 'http://localhost:3000/';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 240)));
  page.on('crash', () => console.log('[CRASH]'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.75, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
    } catch (e) {}
  });
  await page.exposeFunction('saveShot', async (n) => {
    await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 150000 });
    console.log('shot saved:', n);
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const r = await page.evaluate(async (modeArg) => {
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
    try { if (g.cinematics?.active) g.cinematics.skip(); } catch (e) {}
    await wait(2500);

    const p = g.player;
    const m = p.model;
    const out = { phase: window.__kotfsStoreGet().phase };

    const flat = (x, z) => { p.position.set(x, g.world.terrainHeight.height(x, z) + 0.1, z); p.yaw = 0; };
    const drive = (on) => { try { if (on) g.input.keys.add('KeyW'); else g.input.keys.delete('KeyW'); } catch (e) {} };
    const parkFollow = (yaw, pitch, dist) => {
      g.rig.yaw = yaw; g.rig.pitch = pitch;
      g.rig.distance = dist; g.rig.targetDistance = dist;
    };

    // ---- ISOLATION STAGE: hide the world, keep knight + lights + sky ----
    const knightRoot = m.root;
    let sceneChildOfKnight = knightRoot;
    while (sceneChildOfKnight.parent && sceneChildOfKnight.parent !== g.engine.scene) {
      sceneChildOfKnight = sceneChildOfKnight.parent;
    }
    out.isolate = { knightChild: sceneChildOfKnight.name || sceneChildOfKnight.type };
    const hidden = [];
    for (const c of g.engine.scene.children) {
      if (c === sceneChildOfKnight) continue;
      const isLight = !!(c.isLight || c.isDirectionalLight || c.isAmbientLight || c.isHemisphereLight);
      const isSky = /sky|sun|moon|star/i.test(c.name || '');
      const isHelper = !!(c.isHelper || c.isAxesHelper || c.isCameraHelper);
      if (isLight || isSky || isHelper) continue;
      if (c.visible) { c.visible = false; hidden.push(c.name || c.type); }
    }
    out.isolate.hidden = hidden.length;

    // ---- helpers ----
    const bp = (name) => {
      const b = m.boneByName(name);
      if (!b) return null;
      b.updateWorldMatrix(true, false);
      const e = b.matrixWorld.elements;
      return { x: e[12], y: e[13], z: e[14] };
    };
    const armSplayDeg = (shName, elName) => {
      const sh = bp(shName), el = bp(elName);
      if (!sh || !el) return null;
      const dx = el.x - sh.x, dy = el.y - sh.y, dz = el.z - sh.z;
      const horiz = Math.sqrt(dx * dx + dz * dz);
      return Math.round(Math.atan2(horiz, Math.abs(dy)) * 180 / Math.PI);
    };

    // ---- C. SWORD at spawn ----
    out.equippedWeapon = g.state?.equippedWeapon ?? null;
    out.hand = {};
    try {
      const wrist = m.boneByName('j_wristR');
      const found = [];
      const scan = (o, depth) => {
        for (const c of (o.children ?? [])) {
          found.push({ name: c.name || '(anon)', type: c.type, depth });
          if (depth < 3) scan(c, depth + 1);
        }
      };
      if (wrist) scan(wrist, 0);
      out.hand.wristTree = found.slice(0, 10);
    } catch (e) { out.hand.err = String(e); }

    // ---- rAF health check ----
    {
      let n = 0;
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(); };
        requestAnimationFrame(tick);
      });
      out.rafCheck = { frames: n, ms: Math.round(performance.now() - t0) };
      let n2 = 0; const t1 = performance.now();
      await new Promise((res) => { const id = setInterval(() => { n2++; if (performance.now() - t1 > 2000) { clearInterval(id); res(); } }, 100); });
      out.setIntervalCheck = { ticks: n2 };
    }

    if (modeArg === 'data') {
      // ---- A. ARM SPLAY: idle, then walking ----
      flat(24, 158);
      parkFollow(0, 0.12, 3.2);
      drive(false);
      await wait(1500);
      out.splay = { idle: { L: armSplayDeg('j_shoulderL', 'j_elbowL'), R: armSplayDeg('j_shoulderR', 'j_elbowR') } };
      const shR = m.boneByName('j_shoulderR'), elR = m.boneByName('j_elbowR');
      out.boneRotIdle = {
        shoulderR: shR ? [shR.rotation.x, shR.rotation.y, shR.rotation.z].map(v => Math.round(v * 100) / 100) : null,
        elbowR: elR ? [elR.rotation.x, elR.rotation.y, elR.rotation.z].map(v => Math.round(v * 100) / 100) : null,
      };
      drive(true);
      const splayWalk = [];
      const pos0 = { x: p.position.x, z: p.position.z };
      for (let i = 0; i < 20; i++) {
        await wait(100);
        splayWalk.push({
          L: armSplayDeg('j_shoulderL', 'j_elbowL'),
          R: armSplayDeg('j_shoulderR', 'j_elbowR'),
          speed: Math.round((p.speedSm ?? 0) * 100) / 100,
          x: Math.round(p.position.x * 10) / 10, z: Math.round(p.position.z * 10) / 10,
        });
      }
      drive(false);
      out.splay.walk = splayWalk.filter((_, i) => i % 2 === 0);
      out.splay.walkMax = {
        L: Math.max(...splayWalk.map(s => s.L ?? 0)),
        R: Math.max(...splayWalk.map(s => s.R ?? 0)),
      };
      out.splay.advanced = Math.round(Math.hypot(p.position.x - pos0.x, p.position.z - pos0.z) * 10) / 10;
      return out;
    }

    if (modeArg.startsWith('shot:')) {
      if (modeArg.includes('idle')) {
        flat(24, 158); drive(false); await wait(2200);
        parkFollow(0.85, 0.14, 2.7);
        await wait(500);
        await window.saveShot('idle_3q');
      }
      if (modeArg.includes('walk')) {
        flat(24, 158);
        parkFollow(Math.PI * 0.5 + 0.4, 0.10, 2.5);
        drive(true);
        await wait(2400);   // mid-stride, fully warmed
        await window.saveShot('walk_front');
        parkFollow(0.25, 0.12, 2.7);
        await wait(350);
        await window.saveShot('walk_side');
        drive(false);
      }
      if (modeArg.includes('plates')) {
        flat(24, 158); drive(false); await wait(1800);
        parkFollow(1.4, 0.04, 1.55);
        await wait(400);
        await window.saveShot('plates_arm');
        parkFollow(0.4, -0.18, 1.5);
        drive(true);
        await wait(2300);
        await window.saveShot('plates_knee');
        drive(false);
      }
      return { shots: 'done' };
    }
    return { fail: 'unknown mode ' + modeArg };
  }, mode).catch((e) => ({ fail: String(e) }));

  fs.writeFileSync('/tmp/f27_data_full.json', JSON.stringify(r, null, 1));
  console.log('probe done ->', JSON.stringify(r).slice(0, 300));
  await browser.close();
})();
