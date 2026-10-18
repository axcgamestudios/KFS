// probe_f27_species.cjs — build EVERY species model + screenshot the camp
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({ quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false, realLights: false, grass3d: false, renderChunks: 2, reflections: 0, postfx: false, resolution: 0.6, showFps: false, masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true })); }
      if (ph === 'playing') break;
      await wait(400);
    }
    await wait(2000);
    // 1. census: admin-spawn every species in a ring around the player
    const SPECIES = ['duende','kobold','grimpote','slime_comun','arpia','artillero','golem',
      'slime_elemental','guardian_draconico','comandante_fantasma','daimyo','slime_corrosivo',
      'krog','thorne','king_slime'];
    const spawned = {};
    let i = 0;
    for (const id of SPECIES) {
      // frontal arc: all 15 in front of the camera (the rig looks down -Z-ish forward)
      const fwd = g.rig?.yawForward ?? 0;
      const a = fwd + Math.PI / 2 - (i / (SPECIES.length - 1)) * Math.PI;
      const px = g.player.position.x + Math.sin(a) * 7;
      const pz = g.player.position.z + Math.cos(a) * 7;
      const c = g.bestiary.adminSpawn(id, px, pz);
      spawned[id] = !!(c && c.group);
      if (c) c.aggro = false; // stand still for the portrait
      i++;
    }
    // let a few frames render
    await wait(2500);
    // 2. verify each model has visible geometry (bbox non-degenerate)
    const boxes = {};
    for (const id of SPECIES) {
      const list = g.bestiary.list().filter((c) => g.bestiary.speciesOf(c).id === id && c.alive);
      if (!list.length) { boxes[id] = 'none'; continue; }
      const c = list[list.length - 1];
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      c.group.updateMatrixWorld(true);
      c.group.traverse((o) => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return;
        const p = o.geometry.attributes.position;
        const m = o.matrixWorld.elements;
        for (let k = 0; k < p.count; k++) {
          const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
          const wx = m[0]*x+m[4]*y+m[8]*z+m[12], wy = m[1]*x+m[5]*y+m[9]*z+m[13], wz = m[2]*x+m[6]*y+m[10]*z+m[14];
          if (wx<mn[0])mn[0]=wx; if (wx>mx[0])mx[0]=wx;
          if (wy<mn[1])mn[1]=wy; if (wy>mx[1])mx[1]=wy;
          if (wz<mn[2])mn[2]=wz; if (wz>mx[2])mx[2]=wz;
        }
      });
      boxes[id] = { h: +(mx[1]-mn[1]).toFixed(2), w: +(mx[0]-mn[0]).toFixed(2) };
    }
    return { spawned, boxes };
  }).catch(e => ({ err: String(e).slice(0, 300) }));
  console.log(JSON.stringify(r, null, 1));
  console.log('pageErrors:', errors.length, errors.slice(0, 3));
  // 3. screenshot the ring of creatures
  await page.screenshot({ path: 'scripts/shots_f27/species_ring.png' });
  await browser.close();
  process.exit(errors.length || r.err ? 1 : 0);
})();
