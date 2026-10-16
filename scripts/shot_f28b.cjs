// shot_f28b.cjs — F28 live shots using the proven shot_f26 driving pattern
// Usage: node shot_f28b.cjs <idle|walk|attack>
const { chromium } = require('playwright');
const BASE = process.argv[2] ?? 'http://localhost:3000/';
const name = process.argv[3] ?? 'idle';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
  ] });
  const page = await browser.newPage({ viewport: { width: 880, height: 520 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
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
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const proof = await page.evaluate(async ([name]) => {
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
    const kneeR = m.boneByName('j_kneeR');
    const parkFollow = (yaw, pitch, dist) => {
      g.rig.yaw = yaw; g.rig.pitch = pitch;
      g.rig.distance = dist; g.rig.targetDistance = dist;
    };
    p.position.set(24, g.world.terrainHeight.height(24, 162) + 0.1, 162);
    p.yaw = 0;
    g.state.addItem('espada_acero');
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    let proof = '';
    if (name === 'walk') {
      parkFollow(-Math.PI / 2 + 0.3, 0.16, 3.4);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      for (let i = 0; i < 40 && p.speedSm < 3.6; i++) await wait(300);
      for (let i = 0; i < 40; i++) {
        await wait(140);
        if (Math.abs(kneeR.rotation.x) > 0.45 && Math.abs(sh.rotation.x) > 0.1) break;
      }
      await wait(120);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      proof = `speed ${p.speedSm.toFixed(1)}`;
    } else if (name === 'attack') {
      parkFollow(-Math.PI / 2 + 0.35, 0.14, 3.3);
      p.attackKind = 'light1';
      p.attackDur = 99999;
      p.attackT = 0.46;
      for (let i = 0; i < 20; i++) await wait(300);
      proof = 'attack pose';
    } else {
      parkFollow(-Math.PI / 2 - 0.5, 0.12, 3.6);
      for (let i = 0; i < 10; i++) await wait(320);
      proof = 'idle parked';
    }
    return proof;
  }, [name]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/home/z/my-project/scripts/shots_f28/live_${name}.png` });
  await browser.close();
  console.log(`saved live_${name}.png (${proof})`);
})();
