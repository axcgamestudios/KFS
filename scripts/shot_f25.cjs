// shot_f25.cjs — Fase 25 single-shot runner (SwiftShader dies after ~3 shots
// per session, so each invocation takes ONE shot and closes).
// Usage: node shot_f25.cjs <idle|attack|windup|walk|bow|house_inn|house_smith|fp|cape>
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f25';
fs.mkdirSync(OUT, { recursive: true });
const shot = process.argv[2] ?? 'idle';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 880, height: 520 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  page.on('crash', () => console.log('[CRASH]'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.85, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.exposeFunction('saveShot', async (n) => {
    await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 150000 });
    console.log('shot saved:', n);
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  if (shot === 'menu' || shot === 'howto') {
    if (shot === 'howto') {
      const clicked = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === 'How to Play');
        if (!b) return false;
        b.click();
        return true;
      }).catch(() => false);
      console.log('howto clicked:', clicked);
      await page.waitForTimeout(1600);
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${shot}.png`, timeout: 150000 });
    console.log('menu shot saved:', shot);
    await browser.close();
    return;
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
    const sh = m.boneByName('j_shoulderR');

    const parkFollow = (yaw, pitch, dist) => {
      g.rig.yaw = yaw; g.rig.pitch = pitch;
      g.rig.distance = dist; g.rig.targetDistance = dist;
    };

    let proof = '';
    if (name === 'house_inn' || name === 'house_smith') {
      // free camera aimed at a cottage facade (concrete walls check)
      const spot = name === 'house_inn'
        ? { cam: [2, 172.6], look: [2, 1.3, 176], lift: 1.7 }
        : { x: 40, z: 171, cam: [31.5, 171], look: [40, 1.9, 171], lift: 3.6 };
      p.position.set(14, g.world.terrainHeight.height(14, 150) + 0.2, 150); // out of frame
      g.rig.freeCam = true;
      const cam = g.engine.camera;
      const h = g.world.terrainHeight.height(spot.cam[0], spot.cam[2]);
      cam.position.set(spot.cam[0], h + spot.lift, spot.cam[1]);
      cam.lookAt(spot.look[0], h + spot.look[1], spot.look[2]);
      for (let i = 0; i < 8; i++) await wait(350);
      proof = 'house cam parked';
    } else if (name === 'fp') {
      p.position.set(24, g.world.terrainHeight.height(24, 162) + 0.1, 162);
      p.yaw = 0;
      g['toggleFirstPerson'](window.__kotfsStoreGet());
      g.rig.pitch = 0.45; // look a touch down: hands + blade in frame
      for (let i = 0; i < 8; i++) await wait(350);
      proof = 'FP cam';
    } else if (name === 'bow') {
      p.position.set(24, g.world.terrainHeight.height(24, 162) + 0.1, 162);
      p.yaw = 0;
      g.state.addItem('arco_corto');
      g.combat.switchTo('arco_corto');
      parkFollow(-Math.PI / 2 + 0.5, 0.12, 3.2);
      p.bowDraw = 0.9; p.bowAiming = true;
      for (let i = 0; i < 10; i++) { await wait(320); void sh.rotation.x; }
      proof = 'bow draw 0.9';
    } else {
      // sword shots
      p.position.set(24, g.world.terrainHeight.height(24, 162) + 0.1, 162);
      p.yaw = 0;                    // face +Z
      g.state.addItem('espada_acero');
      g.state.equip('espada_acero');
      g.combat.refreshVisuals();
      parkFollow(-Math.PI / 2 + 0.35, 0.14, 3.3);
      if (name === 'walk') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
        for (let i = 0; i < 40 && p.speedSm < 4.2; i++) await wait(300);
        for (let i = 0; i < 5; i++) await wait(250);
        proof = 'speed ' + p.speedSm.toFixed(1);
      } else if (name === 'attack' || name === 'windup') {
        // poseAttack's beats are ABSOLUTE seconds (k<0.42 windup etc.) —
        // freeze inside the beat with a huge duration
        p.attackKind = name === 'attack' ? 'light1' : 'heavy';
        p.attackDur = 99999;
        p.attackT = name === 'attack' ? 0.46 : 0.26;
        const wantSh = name === 'attack' ? -0.25 : -1.8;
        let ok = false;
        for (let i = 0; i < 30; i++) {
          await wait(300);
          if (sh.rotation.x < wantSh) { ok = true; break; }
        }
        proof = (ok ? 'POSE LIVE ' : 'timeout ') + sh.rotation.x.toFixed(2);
      } else {
        for (let i = 0; i < 6; i++) await wait(320);
        proof = 'idle ' + sh.rotation.x.toFixed(2);
      }
    }
    await wait(200);
    await window.saveShot(name);
    return { shot: name, proof };
  }, [shot]).catch((e) => ({ err: String(e).slice(0, 300) }));
  console.log('RESULT', JSON.stringify(r));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
