// Correct in-game skinning audit via THREE.SkinnedMesh.applyBoneTransform
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  page.on('pageerror', e => console.log('ERR', String(e).slice(0, 150)));
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
    await wait(3000);
    const vis = g.player.model;
    const V3 = g.player.position.constructor;
    const out = {};
    const wp = (o) => { o.updateWorldMatrix(true, false); const m = o.matrixWorld.elements; return [m[12], m[13], m[14]]; };
    const wr = vis.root.getObjectByName('j_wristL');
    const el = vis.root.getObjectByName('j_elbowL');
    const sh = vis.root.getObjectByName('j_shoulderL');
    const pwr = wp(wr), pel = wp(el), psh = wp(sh);
    // is the statue shield visible?
    let shield = null;
    vis.root.traverse((o) => { if (o.name === 'j_shield_held') shield = o; });
    out.statueShield = { present: !!shield, visible: shield ? shield.visible : null };
    out.wristWorld = pwr.map((v) => +v.toFixed(2));
    // correct skinning via applyBoneTransform
    const bindWrist = { x: 0.167, y: 1.04, z: 0.204 };
    let meshes = [];
    vis.root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    let handN = 0, devMax = 0, devSum = 0;
    // also audit the whole LEFT ARM region: bind x>0.05, y 0.85..1.6 (upper arm+forearm+hand)
    let armN = 0, armSpan = null;
    const v = new V3();
    for (const m of meshes) {
      m.updateWorldMatrix(true, false);
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const bx = pos.getX(i), by = pos.getY(i), bz = pos.getZ(i);
        v.set(bx, by, bz);
        m.applyBoneTransform(i, v);
        m.localToWorld(v);
        const db = Math.hypot(bx - bindWrist.x, by - bindWrist.y, bz - bindWrist.z);
        if (db <= 0.075 && by <= 1.25) {
          handN++;
          const dev = Math.hypot(v.x - pwr[0], v.y - pwr[1], v.z - pwr[2]);
          devSum += dev;
          if (dev > devMax) devMax = dev;
        }
        // BROAD left-side sweep: anything that STARTED on the left half of
        // the upper body — if any of it ends up below the knee in world
        // space, something dangles (the stretch the user sees)
        if (bx > 0.10 && by > 0.55 && by < 1.62 && Math.abs(bz) < 0.45) {
          armN++;
          if (!armSpan) armSpan = { yMin: v.y, yMax: v.y, xMin: v.x, xMax: v.x };
          if (v.y < armSpan.yMin) armSpan.yMin = v.y;
          if (v.y > armSpan.yMax) armSpan.yMax = v.y;
          if (v.x < armSpan.xMin) armSpan.xMin = v.x;
          if (v.x > armSpan.xMax) armSpan.xMax = v.x;
          if (v.y - (g.player.position.y) < 0.55 && !armSpan.dangle) {
            armSpan.dangle = { bindY: +by.toFixed(2), bindZ: +bz.toFixed(2), bindX: +bx.toFixed(2), worldY: +v.y.toFixed(2) };
          }
        }
      }
    }
    out.hand = { n: handN, devMax: +devMax.toFixed(3), devAvg: handN ? +(devSum / handN).toFixed(3) : null };
    if (armSpan) out.armSpan = { yMin: +armSpan.yMin.toFixed(2), yMax: +armSpan.yMax.toFixed(2), xMin: +armSpan.xMin.toFixed(2), xMax: +armSpan.xMax.toFixed(2), spanY: +(armSpan.yMax - armSpan.yMin).toFixed(2), n: armN };
    // bones' local rotations at idle (what pose is driving)
    out.rot = {
      shoulderL: [sh.rotation.x, sh.rotation.y, sh.rotation.z].map((x) => +x.toFixed(2)),
      elbowL: [el.rotation.x, el.rotation.y, el.rotation.z].map((x) => +x.toFixed(2)),
      wristL: [wr.rotation.x, wr.rotation.y, wr.rotation.z].map((x) => +x.toFixed(2)),
    };
    return out;
  }).catch(e => ({ err: String(e).slice(0, 300) }));
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
