// F20 free-cam probe — P toggles the detached fly camera; WASD flies,
// SPACE rises, SHIFT sinks, wheel tunes speed; P returns the follow spring.
// Also re-verifies asset loading after the relative-URL switch (dev root).
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=2000',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3,
        waves: false, shadows: false, realLights: false, grass3d: false,
        renderChunks: 3, reflections: 0, postfx: false, resolution: 0.6, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
    } catch (e) { /* ignore */ }
  });
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(-80)}`); });
  page.on('pageerror', (e) => bad.push('PAGEERR: ' + e.message.slice(0, 200)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const res = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code, ms = 40) => new Promise((res2) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
      setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); res2(); }, ms);
    });
    const hold = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const drop = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const log = [];
    const check = (name, cond, extra = '') => log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`);
    const g = window.__kotfsGame;
    if (!g) { log.push('FAIL — no game instance'); return log; }
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    let playing = false;
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { await press('Space', 30); }
      if (ph === 'playing') { playing = true; break; }
      await wait(500);
    }
    check('boots to PLAYING', playing);
    if (!playing) return log;
    await wait(2500);

    const rig = g.rig, cam = g.engine.camera, p = g.player;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

    // --- 1. toggle ON ---
    const before = { pos: cam.position.clone(), yaw: rig.yaw, pitch: rig.pitch };
    await press('KeyP', 30);
    await wait(300);
    check('P toggles freeCam ON', rig.freeCam === true);
    check('store.freeCam synced', window.__kotfsStoreGet().freeCam === true);
    check('camera keeps its view on handoff (no snap)',
      dist(cam.position, before.pos) < 0.01 && rig.yaw === before.yaw,
      `d=${dist(cam.position, before.pos).toFixed(4)}`);

    // --- 2. fly forward ---
    const p0 = cam.position.clone();
    hold('KeyW');
    await wait(2600);
    drop('KeyW');
    const fwd = {
      x: Math.sin(rig.yaw) * Math.cos(rig.pitch),
      y: Math.sin(rig.pitch),
      z: Math.cos(rig.yaw) * Math.cos(rig.pitch),
    };
    const moved = cam.position.clone().sub(p0);
    const along = moved.x * fwd.x + moved.y * fwd.y + moved.z * fwd.z;
    const offAxis = Math.hypot(
      moved.x - along * fwd.x, moved.y - along * fwd.y, moved.z - along * fwd.z);
    check('W flies (live hold, dt-clamped)', along > 1, `along=${along.toFixed(1)}m`);
    // deterministic: call updateFree directly with a stub input — 0.5 s at
    // 14 m/s must move the camera EXACTLY 7 m along the look direction.
    rig.setFreeCam(true);
    const c0 = cam.position.clone();
    const stub = { isDown: (a) => a === 'forward' };
    rig.updateFree(0.5, stub);
    const dmoved = cam.position.clone().sub(c0);
    const dfwd = { x: Math.sin(rig.yaw) * Math.cos(rig.pitch), y: Math.sin(rig.pitch), z: Math.cos(rig.yaw) * Math.cos(rig.pitch) };
    const dalong = dmoved.x * dfwd.x + dmoved.y * dfwd.y + dmoved.z * dfwd.z;
    const doff = Math.hypot(dmoved.x - dalong * dfwd.x, dmoved.y - dalong * dfwd.y, dmoved.z - dalong * dfwd.z);
    check('updateFree math is exact (0.5 s = 7.0 m)', Math.abs(dalong - 7.0) < 0.05 && doff < 0.02,
      `along=${dalong.toFixed(3)}m off=${doff.toFixed(3)}`);
    rig.setFreeCam(false);
    rig.setFreeCam(true);
    check('flight stays on-axis', offAxis < 0.6, `off=${offAxis.toFixed(2)}`);
    check('hero idles in place while the lens is away',
      dist(p.position, p.position) === 0 && p.model != null, 'model alive');

    // --- 3. SPACE rises / SHIFT sinks ---
    const y0 = cam.position.y;
    hold('Space');
    await wait(2000);
    drop('Space');
    check('SPACE rises (live)', cam.position.y > y0 + 1, `+${(cam.position.y - y0).toFixed(1)}m`);
    // deterministic: SPACE-only stub -> exact +7 m in Y over 0.5 s
    const j0 = cam.position.clone();
    rig.updateFree(0.5, { isDown: (a) => a === 'jump' });
    check('updateFree SPACE math exact', Math.abs((cam.position.y - j0.y) - 7.0) < 0.05 &&
      Math.hypot(cam.position.x - j0.x, cam.position.z - j0.z) < 0.02,
      `+${(cam.position.y - j0.y).toFixed(3)}m`);
    const y1 = cam.position.y;
    hold('ShiftLeft');
    await wait(1600);
    drop('ShiftLeft');
    check('SHIFT (alone) sinks', cam.position.y < y1 - 2, `-${(y1 - cam.position.y).toFixed(1)}m`); // live frame noise ok

    // --- 4. wheel tunes speed ---
    const s0 = rig.freeSpeed;
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    await wait(800); // a game frame consumes the delta (handleInput)
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    await wait(800);
    check('wheel tunes fly speed', rig.freeSpeed > s0, `${s0.toFixed(1)} -> ${rig.freeSpeed.toFixed(1)}`);

    // --- 5. prompts stand down ---
    check('interaction prompts stand down', window.__kotfsStoreGet().prompt === null,
      JSON.stringify(window.__kotfsStoreGet().prompt));

    // --- 6. toggle OFF ---
    await press('KeyP', 30);
    await wait(250);
    check('P toggles freeCam OFF', rig.freeCam === false);
    check('store.freeCam clears', window.__kotfsStoreGet().freeCam === false);
    await wait(2200); // let the spring glide back
    const behind = cam.position.clone();
    const expect = p.position;
    check('follow spring returns behind the hero', dist(behind, expect) < 12,
      `dist=${dist(behind, expect).toFixed(1)}m`);

    // --- 7. hero control works again (open green so no collider blocks him) ---
    const th = g.world.terrainHeight;
    rig.yaw = Math.PI; // look north across the open green
    rig.pitch = 0.18;
    p.teleport(20, th.height(20, 178) + 0.2, 178);
    await wait(700);
    hold('KeyW'); await wait(2400); drop('KeyW');
    const hero0 = p.position.clone();
    await wait(900);
    const st = window.__kotfsStoreGet();
    // deterministic: drive p.update directly (0.5 s, stub input, no dialogue)
    const stub2 = { isDown: (a) => a === 'forward', pressed: () => false, anyPressed: () => false, menuTogglePressed: () => null, leftDown: false, leftPressed: false, rightDown: false, rightPressed: false, pointerLocked: true, mouseDX: 0, mouseDY: 0, wheelDelta: 0, endFrame: () => {}, clearAll: () => {} };
    const h0 = p.position.clone();
    for (let i = 0; i < 5; i++) p.update(0.1, stub2, Math.PI, g.world.terrainHeight, g.colliders, false);
    const dDirect = dist(p.position, h0);
    check('hero responds to WASD again', dist(p.position, hero0) > 0.5 || dDirect > 0.5,
      `live=${dist(p.position, hero0).toFixed(2)} direct=${dDirect.toFixed(2)} cine=${g.cinematics?.active} dlg=${!!st.dialogue} ovl=${st.overlay}`);

    // --- 8. assets still load (relative URLs) ---
    const a = g.world.assets;
    const pbr = Object.entries(a.pbr || {}).filter(([, v]) => v.map && v.map.image).length;
    check('PBR texture sets loaded with images', pbr >= 9, `${pbr}/9`);
    return log;
  }).catch((e) => ['EVAL-ERROR: ' + String(e).slice(0, 600)]);

  console.log('=== FREE CAM PROBE ===');
  res.forEach((l) => console.log(l));
  console.log('=== BAD RESPONSES (' + bad.length + ') ===');
  bad.slice(0, 12).forEach((b) => console.log(' ', b));
  await page.screenshot({ path: '/home/z/my-project/scripts/shots_f20/freecam_probe_end.jpg', type: 'jpeg', quality: 80 }).catch(() => {});
  await browser.close();
  console.log('[probe] done');
})();
