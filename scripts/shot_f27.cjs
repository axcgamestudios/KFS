// shot_f27.cjs — Fase 27 single-shot runner (SwiftShader: ONE shot per run).
// Usage: node shot_f27.cjs <hand|hand_walk|attack|houses|houses_close|walk|elder>
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f27';
fs.mkdirSync(OUT, { recursive: true });
const shot = process.argv[2] ?? 'hand';
const BASE = process.argv[3] ?? 'http://localhost:3117/';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  page.on('crash', () => console.log('[CRASH]'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.9, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const r = await page.evaluate(async ([name]) => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
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
    const p = g.player;
    const m = p.model;

    const park = (yaw, pitch, dist) => {
      g.rig.yaw = yaw; g.rig.pitch = pitch;
      g.rig.distance = dist; g.rig.targetDistance = dist;
    };
    let proof = '';

    // put the hero on the green in front of Rosa's cottage (houses visible)
    const spot = { x: 14, z: 158 };
    p.position.set(spot.x, g.world.terrainHeight.height(spot.x, spot.z) + 0.1, spot.z);

    if (name === 'houses' || name === 'houses_close') {
      p.yaw = 0.9;
      park(name === 'houses' ? 0.9 + Math.PI : 1.35 + Math.PI, -0.12, name === 'houses' ? 9 : 4.5);
      if (name === 'houses_close') {
        // stand right at Rosa's inn wall (2, 176)
        const hx = 4, hz = 170;
        p.position.set(hx, g.world.terrainHeight.height(hx, hz) + 0.1, hz);
        p.yaw = Math.PI + 0.12;
        park(Math.PI + 0.12 + Math.PI * 0.62, -0.06, 3.4);
      }
      await wait(900);
      proof = 'houses';
    } else if (name === 'elder') {
      // wake the Elder right there for the banner + dragon shot
      const d = g.legendary.debugAwakenElder(p.position.x + 4, p.position.z + 30);
      void d;
      const drag = g.dragons.dragonById('elderdragon');
      park(0.05, 0.06, 22);
      await wait(2400);
      proof = drag ? 'elder awake ' + drag.hp + ' flying ' + drag.flying : 'elder null';
    } else {
      // hand / walk / attack — the F26 proven pattern: the GAME loop drives,
      // the shot polls bones until the pose provably renders
      g.state.addItem('espada_acero');
      g.state.equip('espada_acero');
      g.combat.refreshVisuals();
      const sh = m.boneByName('j_shoulderR');
      const kneeR = m.boneByName('j_kneeR');
      p.yaw = 0;
      if (name === 'hand') {
        park(Math.PI * 0.5, -0.06, 2.2);
        for (let i = 0; i < 8; i++) await wait(320);
        proof = 'idle hand';
      } else if (name === 'hand_walk' || name === 'walk') {
        park(name === 'walk' ? -Math.PI / 2 + 0.3 : Math.PI * 0.5, 0.16, 3.4);
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
        for (let i = 0; i < 40 && p.speedSm < 3.2; i++) await wait(300);
        let ok = false;
        for (let i = 0; i < 40; i++) {
          await wait(140);
          if (Math.abs(kneeR.rotation.x) > 0.45 && Math.abs(sh.rotation.x) > 0.1) { ok = true; break; }
        }
        await wait(120);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
        proof = `speed ${p.speedSm.toFixed(1)} stride ${ok ? 'rendered' : 'no'}`;
      } else if (name === 'attack') {
        park(-Math.PI / 2 + 0.35, 0.14, 3.3);
        p.attackKind = 'light1';
        p.attackDur = 99999;
        p.attackT = 0.5;
        let ok = false;
        for (let i = 0; i < 30; i++) {
          await wait(300);
          if (sh.rotation.x > -0.3) { ok = true; break; }
        }
        proof = `strike pose rendered ${ok ? 'yes' : 'no'}`;
      }
    }
    await wait(350);
    return proof;
  }, [shot]).catch((e) => 'EVAL FAIL ' + String(e).slice(0, 200));

  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/live_${shot}.png`, timeout: 150000 });
  console.log(`[${shot}] ${r}`);
  await browser.close();
})();
