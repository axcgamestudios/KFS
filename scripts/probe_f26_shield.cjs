// probe_f26_shield.cjs — what meshes are ACTUALLY visible on the player in
// the shot-script state (sword equipped, idle)? Settle the "VLM sees a
// shield" question with ground truth: every visible mesh, its name, size,
// and distance from the left elbow. Also the sword's world pose (blade
// direction) for the grip check.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
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
    const m = p.model;
    p.position.set(24, g.world.terrainHeight.height(24, 162) + 0.1, 162);
    p.yaw = 0;
    g.state.addItem('espada_acero');
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    await wait(1500);
    // freeze attack poses (F24 pattern) and read the blade direction in each
    const bladeDirs = {};
    const hero0 = (() => { let h = null; m.root.traverse((o) => { if (o.userData?.heroSword) h = o; }); return h; })();
    const readBlade = () => {
      m.root.updateMatrixWorld(true);
      const mw = hero0.matrixWorld.elements;
      const dir = [mw[4], mw[5], mw[6]];
      const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const ry = m.root.rotation?.y ?? 0;
      const cx = Math.cos(-ry), sx = Math.sin(-ry);
      const wx = dir[0] / len, wz = dir[2] / len;
      return [+(wx * cx - wz * sx).toFixed(3), +(dir[1] / len).toFixed(3), +(wx * sx + wz * cx).toFixed(3)];
    };
    for (const [label, kind, at] of [['idle', null, 0], ['light1_windup', 'light1', 0.2], ['light1_strike', 'light1', 0.46], ['heavy_windup', 'heavy', 0.26], ['thrust', 'thrust', 0.5]]) {
      if (kind) { p.attackKind = kind; p.attackDur = 99999; p.attackT = at; }
      else { p.attackT = 0; }
      for (let i = 0; i < 12; i++) { p.model.update({ dt: 1/30, speed: 0, moving: false, grounded: true, swimming: false, attackT: p.attackT, attackKind: kind, attackDur: 99999 }); }
      bladeDirs[label] = readBlade();
    }
    p.attackT = 0; p.attackDur = 0.5;
    for (let i = 0; i < 20; i++) p.model.update({ dt: 1/30, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0 });
    const out = { bladeDirs };
    // every VISIBLE mesh under the player root
    const meshes = [];
    m.root.updateMatrixWorld(true);
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      // effective visibility (parents too)
      let vis = true, par = o;
      while (par) { if (par.visible === false) { vis = false; break; } par = par.parent; }
      if (!vis) return;
      const bb = { mn: [1e9,1e9,1e9], mx: [-1e9,-1e9,-1e9] };
      const g2 = o.geometry, pa = g2.attributes.position, mw = o.matrixWorld.elements;
      for (let i = 0; i < pa.count; i += 3) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const wx = mw[0]*x + mw[4]*y + mw[8]*z + mw[12];
        const wy = mw[1]*x + mw[5]*y + mw[9]*z + mw[13];
        const wz = mw[2]*x + mw[6]*y + mw[10]*z + mw[14];
        if (wx<bb.mn[0])bb.mn[0]=wx; if (wx>bb.mx[0])bb.mx[0]=wx;
        if (wy<bb.mn[1])bb.mn[1]=wy; if (wy>bb.mx[1])bb.mx[1]=wy;
        if (wz<bb.mn[2])bb.mn[2]=wz; if (wz>bb.mx[2])bb.mx[2]=wz;
      }
      const c = [(bb.mn[0]+bb.mx[0])/2, (bb.mn[1]+bb.mx[1])/2, (bb.mn[2]+bb.mx[2])/2];
      meshes.push({
        name: o.name || o.parent?.name || '(unnamed)',
        mat: (Array.isArray(o.material) ? o.material[0]?.name : o.material?.name) || '',
        size: [+(bb.mx[0]-bb.mn[0]).toFixed(2), +(bb.mx[1]-bb.mn[1]).toFixed(2), +(bb.mx[2]-bb.mn[2]).toFixed(2)],
        center: c.map((n) => +n.toFixed(2)),
      });
    });
    out.visibleMeshes = meshes;
    out.shieldPropVisible = (() => { let s = null; m.root.traverse((o) => { if (o.name === 'j_shield_held') s = o; }); return s ? s.visible : 'missing'; })();
    out.swordPropVisible = (() => { let s = null; m.root.traverse((o) => { if (o.name === 'j_sword_held') s = o; }); return s ? s.visible : 'missing'; })();
    // the hero sword's blade direction in the CHARACTER frame
    const hero = (() => { let h = null; m.root.traverse((o) => { if (o.userData?.heroSword) h = o; }); return h; })();
    if (hero) {
      m.root.updateMatrixWorld(true);
      const mw = hero.matrixWorld.elements;
      // manual math (no THREE in page context): local +Y of the sword in world
      const dir = [mw[4], mw[5], mw[6]];
      const len = Math.hypot(dir[0], dir[1], dir[2]);
      out.heroSwordBladeDirWorld = dir.map((n) => +(n / len).toFixed(3));
      // character frame: rotate world dir by the root's inverse yaw
      const ry = m.root.rotation?.y ?? 0;
      const cx = Math.cos(-ry), sx = Math.sin(-ry);
      const wx = dir[0] / len, wz = dir[2] / len;
      out.heroSwordBladeDirChar = [+(wx * cx - wz * sx).toFixed(3), +(dir[1] / len).toFixed(3), +(wx * sx + wz * cx).toFixed(3)];
      out.heroSwordWorldPos = [mw[12], mw[13], mw[14]].map((n) => +n.toFixed(2));
    }
    return out;
  }).catch((e) => ({ fail: String(e).slice(0, 300) }));
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
