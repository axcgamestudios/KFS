// Numerical left-arm audit IN GAME: bone chain lengths + skinned hand tracking
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
    const out = {};
    const wp = (o) => { o.updateWorldMatrix(true, false); const m = o.matrixWorld.elements; return [m[12], m[13], m[14]]; };
    const bone = (n) => vis.root.getObjectByName(n);
    const sh = bone('j_shoulderL'), el = bone('j_elbowL'), wr = bone('j_wristL');
    if (!sh || !el || !wr) return { fail: 'bones missing' };
    const psh = wp(sh), pel = wp(el), pwr = wp(wr);
    const d = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
    out.idleBones = {
      shoulderY: +psh[1].toFixed(3), elbowY: +pel[1].toFixed(3), wristY: +pwr[1].toFixed(3),
      upperArmLen: +d(psh, pel).toFixed(3), forearmLen: +d(pel, pwr).toFixed(3),
      wristPos: pwr.map((v) => +v.toFixed(2)),
    };
    // skinned hand verts: bind positions near the wrist bone (game space)
    const bindWrist = { x: 0.167, y: 1.04, z: 0.204 };
    let meshes = [];
    vis.root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    out.skinnedMeshes = meshes.map((m) => m.name);
    const handAudit = (label) => {
      let n = 0, maxDev = 0, yMin = 1e9, yMax = -1e9, zMin = 1e9, zMax = -1e9;
      const v = new (window.THREE ? window.THREE.Vector3 : Object)();
      for (const m of meshes) {
        m.updateWorldMatrix(true, false);
        const pos = m.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const bx = pos.getX(i), by = pos.getY(i), bz = pos.getZ(i);
          // BIND-space distance to the wrist bone (mesh local == bind pose here
          // because the rigger bakes game-space transforms into the geometry)
          const db = Math.hypot(bx - bindWrist.x, by - bindWrist.y, bz - bindWrist.z);
          if (db > 0.075 || by > 1.25) continue;
          // skinned world position
          const w = m.applyBoneTransform ? (m.applyBoneTransform(i, new (window.THREE.Vector3(bx, by, bz))), arguments) : null;
          n++;
        }
      }
      return { n };
    };
    // THREE may not be global — do the math manually with matrixWorld + skin weights
    const manualAudit = () => {
      const res = { hand: 0, devMax: 0, armYMin: 1e9, armYMax: -1e9 };
      for (const m of meshes) {
        m.updateWorldMatrix(true, false);
        m.skeleton.update?.();
        const pos = m.geometry.attributes.position;
        const joints = m.geometry.attributes.skinIndex;
        const weights = m.geometry.attributes.skinWeight;
        const mw = m.matrixWorld.elements;
        for (let i = 0; i < pos.count; i++) {
          const bx = pos.getX(i), by = pos.getY(i), bz = pos.getZ(i);
          if (Math.hypot(bx - bindWrist.x, by - bindWrist.y, bz - bindWrist.z) > 0.075 || by > 1.25) continue;
          res.hand++;
          // skinned: sum w * boneMatrix * bind
          let sx = 0, sy = 0, sz = 0;
          for (let k = 0; k < 4; k++) {
            const w = weights.getX ? weights.getComponent(i * 4 + k) : 0;
            if (w <= 0) continue;
            const b = m.skeleton.bones[joints.getX(i * 4 + k) !== undefined ? joints.getComponent(i * 4 + k) : 0];
            if (!b) continue;
            // bone world matrix * bind position (approx: apply bone's world matrix to the bind point)
            const e = b.matrixWorld.elements;
            const wx = e[0]*bx + e[4]*by + e[8]*bz + e[12];
            const wy = e[1]*bx + e[5]*by + e[9]*bz + e[13];
            const wz = e[2]*bx + e[6]*by + e[10]*bz + e[14];
            sx += w * wx; sy += w * wy; sz += w * wz;
          }
          // mesh world transform
          const gx = mw[0]*sx + mw[4]*sy + mw[8]*sz + mw[12];
          const gy = mw[1]*sx + mw[5]*sy + mw[9]*sz + mw[13];
          if (gy < res.armYMin) res.armYMin = gy;
          if (gy > res.armYMax) res.armYMax = gy;
          // dev from the wrist bone world position
          const dev = Math.hypot(gx - pwr[0], gy - pwr[1]);
          if (dev > res.devMax) { res.devMax = dev; res.devAt = [gx.toFixed(2), gy.toFixed(2)]; }
        }
      }
      res.armYMin = +res.armYMin.toFixed(3); res.armYMax = +res.armYMax.toFixed(3);
      res.devMax = +res.devMax.toFixed(3);
      return res;
    };
    out.idleHand = manualAudit();
    // walk 2 s and re-audit
    const stub = { isDown: (a) => a === 'forward', pressed: () => false, anyPressed: () => false, menuTogglePressed: () => null, leftDown: false, leftPressed: false, rightDown: false, rightPressed: false, pointerLocked: true, mouseDX: 0, mouseDY: 0, wheelDelta: 0, endFrame: () => {}, clearAll: () => {} };
    const w = g.world;
    for (let i = 0; i < 45; i++) g.player.update(1 / 30, stub, g.rig.yawForward, w.terrainHeight ?? w.terrain, g.colliders, false);
    const pwr2 = wp(wr), pel2 = wp(el);
    out.walkBones = { wristPos: pwr2.map((v) => +v.toFixed(2)), forearmLen: +d(pel2, pwr2).toFixed(3) };
    out.walkHand = manualAudit();
    return out;
  }).catch(e => ({ err: String(e).slice(0, 300) }));
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
