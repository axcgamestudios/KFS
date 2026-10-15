// probe_f25_blade.cjs — measure the GLB greatsword's blade direction in the
// character frame at held poses (idle / light1 windup+strike / heavy windup /
// thrust), plus the bow's limb axis. For grip-pose tuning on the NEW armour
// model (its A-pose forearm changes the wrist frame vs the old statue rig).
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 380 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
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
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async () => {
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
    const h = g.world.terrainHeight.height(24, 162);
    p.position.set(24, h + 0.1, 162);
    p.yaw = 0;
    g.state.addItem('espada_acero');
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    await wait(2500);

    const mulPoint = (m, x, y, z) => [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
    const findWeapon = () => {
      let sw = null;
      g.player.model.root.traverse((o) => { if (!sw && (o.userData?.glbSword || o.name === 'glb_sword')) sw = o; });
      return sw;
    };
    const sample = (label, tipY, gripY) => {
      const sw = findWeapon();
      if (!sw) return { err: 'no glb sword' };
      sw.updateWorldMatrix(true, false);
      const m = sw.matrixWorld.elements;
      const tip = mulPoint(m, 0, tipY, 0);
      const grip = mulPoint(m, 0, gripY, 0);
      const pp = p.position;
      const yaw = p.yaw;
      const loc = (v) => {
        const dx = v[0] - pp.x, dz = v[2] - pp.z;
        return { x: Math.cos(yaw) * dx - Math.sin(yaw) * dz, z: Math.sin(yaw) * dx + Math.cos(yaw) * dz, y: v[1] - pp.y };
      };
      const tipL = loc(tip), gripL = loc(grip);
      let d = { x: tipL.x - gripL.x, y: tipL.y - gripL.y, z: tipL.z - gripL.z };
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      d = { x: +(d.x / len).toFixed(3), y: +(d.y / len).toFixed(3), z: +(d.z / len).toFixed(3) };
      const tipGround = +(tipL.y + pp.y - h).toFixed(2);
      return { dir: d, tipHeightAboveGround: tipGround, gripLocal: { x: +gripL.x.toFixed(2), y: +gripL.y.toFixed(2), z: +gripL.z.toFixed(2) } };
    };
    const out = {};
    // GLB sword: blade tip at +0.93, pommel at -0.31 (from grip origin)
    out.idle = sample('idle', 0.93, 0);
    const holdPose = async (kind, k) => {
      p.attackKind = kind; p.attackDur = 99999; p.attackT = k;
      await wait(1400);
    };
    await holdPose('light1', 0.30);  out.light1_windup = sample('w', 0.93, 0);
    await holdPose('light1', 0.78);  out.light1_strike = sample('s', 0.93, 0);
    await holdPose('heavy', 0.22);   out.heavy_windup = sample('w', 0.93, 0);
    await holdPose('thrust', 0.75);  out.thrust = sample('t', 0.93, 0);
    // back to idle
    p.attackT = 0;
    await wait(1500);

    // bow limb axis + string side in the character frame
    g.state.addItem('arco_corto');
    g.combat.switchTo('arco_corto');
    p.bowDraw = 0.9; p.bowAiming = true;
    await wait(1800);
    let bow = null;
    g.player.model.root.traverse((o) => { if (!bow && (o.userData?.glbBow || o.name === 'glb_bow')) bow = o; });
    if (bow) {
      bow.updateWorldMatrix(true, false);
      const m = bow.matrixWorld.elements;
      const top = mulPoint(m, 0, 0.71, 0);
      const mid = mulPoint(m, 0, 0, 0);
      const belly = mulPoint(m, -0.05, 0, 0); // the archer-side of the riser
      const loc = (v) => {
        const dx = v[0] - p.position.x, dz = v[2] - p.position.z;
        const yaw = p.yaw;
        return { x: Math.cos(yaw) * dx - Math.sin(yaw) * dz, z: Math.sin(yaw) * dx + Math.cos(yaw) * dz, y: v[1] - p.position.y };
      };
      const t = loc(top), b = loc(mid);
      let axis = { x: t.x - b.x, y: t.y - b.y, z: t.z - b.z };
      const len = Math.hypot(axis.x, axis.y, axis.z) || 1;
      axis = { x: +(axis.x / len).toFixed(3), y: +(axis.y / len).toFixed(3), z: +(axis.z / len).toFixed(3) };
      out.bow = { limbAxis: axis, gripLocal: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2) } };
    } else out.bow = { err: 'no glb bow' };
    return out;
  }).catch(e => ({ fail: String(e).slice(0, 300) }));
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
