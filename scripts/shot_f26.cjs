// shot_f26.cjs — Fase 26 single-shot runner (SwiftShader dies after ~3 shots
// per session, so each invocation takes ONE shot and closes).
// Usage: node shot_f26.cjs <idle|walk|walk_front|attack|windup|fp>
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f26';
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
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    const sh = m.boneByName('j_shoulderR');
    const ankR = m.boneByName('j_ankleR');
    const kneeR = m.boneByName('j_kneeR');

    const parkFollow = (yaw, pitch, dist) => {
      g.rig.yaw = yaw; g.rig.pitch = pitch;
      g.rig.distance = dist; g.rig.targetDistance = dist;
    };

    let proof = '';
    if (name === 'fp') {
      p.position.set(24, g.world.terrainHeight.height(24, 162) + 0.1, 162);
      p.yaw = 0;
      g['toggleFirstPerson'](window.__kotfsStoreGet());
      g.rig.pitch = 0.5;
      for (let i = 0; i < 8; i++) await wait(350);
      proof = 'FP cam';
    } else if (name === 'walk' || name === 'walk_front') {
      p.position.set(24, g.world.terrainHeight.height(24, 162) + 0.1, 162);
      p.yaw = 0;
      g.state.addItem('espada_acero');
      g.state.equip('espada_acero');
      g.combat.refreshVisuals();
      // walk: side (perpendicular) and front views — poll a bone until the
      // stride PROVABLY renders (hip swings, knee bent mid-stride)
      parkFollow(name === 'walk' ? -Math.PI / 2 + 0.3 : 0.32, 0.16, 3.4);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      for (let i = 0; i < 40 && p.speedSm < 3.6; i++) await wait(300);
      let ok = false;
      for (let i = 0; i < 40; i++) {
        await wait(140);
        if (Math.abs(kneeR.rotation.x) > 0.45 && Math.abs(sh.rotation.x) > 0.1) { ok = true; break; }
      }
      for (let i = 0; i < 2; i++) await wait(60);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      proof = `speed ${p.speedSm.toFixed(1)} kneeBent ${ok ? 'yes' : 'no'}`;
    } else if (name === 'attack' || name === 'windup') {
      p.position.set(24, g.world.terrainHeight.height(24, 162) + 0.1, 162);
      p.yaw = 0;
      g.state.addItem('espada_acero');
      g.state.equip('espada_acero');
      g.combat.refreshVisuals();
      parkFollow(-Math.PI / 2 + 0.35, 0.14, 3.3);
      p.attackKind = name === 'attack' ? 'light1' : 'heavy';
      p.attackDur = 99999;
      p.attackT = name === 'attack' ? 0.46 : 0.26;
      const wantSh = name === 'attack' ? -0.25 : -1.8;
      let ok = false;
      for (let i = 0; i < 30; i++) {
        await wait(300);
        if (sh.rotation.x < wantSh) { ok = true; break; }
      }
      proof = `pose rendered ${ok ? 'yes' : 'no'}`;
    } else {
      // idle: 3/4 front, low angle — sword carry + NO shield on the left arm
      p.position.set(24, g.world.terrainHeight.height(24, 162) + 0.1, 162);
      p.yaw = 0;
      g.state.addItem('espada_acero');
      g.state.equip('espada_acero');
      g.combat.refreshVisuals();
      parkFollow(-Math.PI / 2 - 0.5, 0.12, 3.6);
      for (let i = 0; i < 10; i++) await wait(320);
      proof = 'idle parked';
    }
    await wait(400);
    return { proof, speedSm: +p.speedSm.toFixed(2), attackT: +p.attackT.toFixed(2) };
  }, [shot]).catch((e) => ({ fail: String(e).slice(0, 200) }));
  console.log('state:', JSON.stringify(r));
  await page.screenshot({ path: `${OUT}/${shot}.png`, timeout: 150000 });
  console.log('shot saved:', shot);
  await browser.close();
})();
