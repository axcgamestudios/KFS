// e2e_f21_knight_debug.js — why does the knight render as a blob?
// Close-up screenshot + full model diagnostics (material, texture, bounds).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f21';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=2600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'medium', tier: 'medium', settingsRev: 3,
        waves: false, shadows: false, realLights: false, grass3d: false,
        renderChunks: 4, reflections: 0, postfx: false, resolution: 0.6, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) { /* ignore */ }
  });
  await page.exposeFunction('saveShot', async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 88, timeout: 60000 });
    console.log('shot:', name);
  });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const diag = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const g = window.__kotfsGame;
    if (!g) return { fatal: 'no game' };
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    let playing = false;
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') { playing = true; break; }
      await wait(500);
    }
    if (!playing) return { fatal: 'never playing' };
    await wait(6000);

    const out = {};
    const root = g.player.model.root;
    out.rootChildren = root.children.map((c) => c.type + ':' + c.name);
    out.grandchildren = root.children[0]?.children?.map((c) => c.type + ':' + c.name) ?? [];

    let meshInfo = null;
    root.traverse((o) => {
      if ((o.isSkinnedMesh || o.isMesh) && !meshInfo) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        meshInfo = {
          type: o.type, name: o.name, visible: o.visible,
          castShadow: o.castShadow, frustumCulled: o.frustumCulled,
          material: mats.map((m) => ({
            name: m.name, hasMap: !!m.map, mapImage: m.map ? (m.map.image ? 'img' : (m.map.source ? 'source' : 'none')) : 'no-map',
            color: m.color ? '#' + m.color.getHexString() : 'none',
            vertexColors: !!m.vertexColors,
          })),
          geometry: {
            posCount: o.geometry.attributes.position.count,
            hasSkinIndex: !!o.geometry.attributes.skinIndex,
            hasSkinWeight: !!o.geometry.attributes.skinWeight,
          },
        };
      }
    });
    out.mesh = meshInfo;

    // bounding sphere of the skinned mesh in world space (three's math)
    let sm = null;
    root.traverse((o) => { if (o.isSkinnedMesh && !sm) sm = o; });
    if (sm) {
      const pos = sm.geometry.attributes.position;
      const Vec3Ctor = Object.getPrototypeOf(sm.position).constructor;
      const v = new Vec3Ctor();
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      // applyBoneTransform mutates a Vector3-like with x/y/z
      for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 2000))) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        sm.applyBoneTransform(i, v);
        // localToWorld via matrixWorld
        const e = sm.matrixWorld.elements;
        const wx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12];
        const wy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13];
        const wz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14];
        if (wx < min[0]) min[0] = wx; if (wy < min[1]) min[1] = wy; if (wz < min[2]) min[2] = wz;
        if (wx > max[0]) max[0] = wx; if (wy > max[1]) max[1] = wy; if (wz > max[2]) max[2] = wz;
      }
      out.skinBBox = { min: min.map((n) => +n.toFixed(2)), max: max.map((n) => +n.toFixed(2)) };
      const wp = new (Object.getPrototypeOf(sm.position).constructor)();
      sm.getWorldPosition(wp);
      out.meshWorldPos = wp.toArray().map((n) => +n.toFixed(2));
    }
    out.playerPos = [g.player.position.x, g.player.position.y, g.player.position.z].map((n) => +n.toFixed(2));
    out.terrainAtPlayer = +g.world.terrainHeight.height(g.player.position.x, g.player.position.z).toFixed(2);
    out.modelType = g.player.model.constructor.name;

    // the SKINNED mesh's material + texture specifically
    if (sm) {
      const mats = Array.isArray(sm.material) ? sm.material : [sm.material];
      out.skinnedMaterial = mats.map((m) => ({
        name: m.name,
        hasMap: !!m.map,
        mapImg: m.map ? (m.map.image ? `${m.map.image.width}x${m.map.image.height}` : 'no-image') : 'no-map',
        colorHex: m.color ? '#' + m.color.getHexString() : 'none',
        skinningWorks: sm.skeleton.bones.length === 15,
      }));
    }

    // close-up: camera 3 m in front of the player's face, eye level
    const p = g.player.position;
    const yaw = g.player.yaw;
    g.rig.freeCam = true;
    g.rig.freePos.set(p.x + Math.sin(yaw) * 3.4, p.y + 1.55, p.z + Math.cos(yaw) * 3.4);
    g.rig.yaw = yaw + Math.PI;
    g.rig.pitch = 0.04;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await wait(3500);
    // hide ALL overlay DOM so the shot is pure world
    const hidden = [];
    for (const el of document.body.children) {
      if (el.tagName !== 'CANVAS' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
        if (el.style.display !== 'none') { hidden.push(el); el.style.display = 'none'; }
      }
    }
    // also the canvas siblings inside wrappers: hide every element that is not the canvas
    const canvas = document.querySelector('canvas');
    for (const el of document.querySelectorAll('body *')) {
      if (el !== canvas && !canvas.contains(el) && el.style.display !== 'none' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'LINK' && el.tagName !== 'META') {
        el.dataset.kfsHidden = '1'; el.style.display = 'none';
      }
    }
    await wait(800);
    await window.saveShot('knight_closeup');
    // restore
    for (const el of hidden) el.style.display = '';
    document.querySelectorAll('[data-kfs-hidden]').forEach((el) => { el.style.display = ''; delete el.dataset.kfsHidden; });
    g.rig.freeCam = false;
    return out;
  });

  console.log(JSON.stringify(diag, null, 1));
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
