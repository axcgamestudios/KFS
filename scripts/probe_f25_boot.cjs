// probe_f25_boot.cjs — Fase 25 integration probe:
//  1. the new armour knight loads + drives (bones found, cape bones live)
//  2. the uploaded GLB greatsword equips (glb_sword in the right hand slot)
//  3. the uploaded GLB longbow equips (glb_bow in the left hand)
//  4. FIRST PERSON (B) toggles
//  5. no page errors, sane draw calls
const { chromium } = require('playwright');
const BASE = process.argv[2] ?? 'http://localhost:3000/';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(String(e).slice(0, 200)); });
  page.on('crash', () => console.log('[CRASH] page crashed'));
  page.on('console', m => { const t = m.text(); if (/\[F25\]/i.test(t)) console.log('[console]', t.slice(0, 120)); });
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
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    if (!g) return { fail: 'no game' };
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
    await wait(4000);

    const out = { phase: window.__kotfsStoreGet().phase };
    // pure-JS bbox (no THREE global in page context)
    const bboxOf = (root) => {
      let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
      root.updateMatrixWorld && root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
        const p = o.geometry.attributes.position;
        const m = o.matrixWorld.elements;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const wx = m[0]*x + m[4]*y + m[8]*z + m[12];
          const wy = m[1]*x + m[5]*y + m[9]*z + m[13];
          const wz = m[2]*x + m[6]*y + m[10]*z + m[14];
          if (wx<mn[0])mn[0]=wx; if (wx>mx[0])mx[0]=wx;
          if (wy<mn[1])mn[1]=wy; if (wy>mx[1])mx[1]=wy;
          if (wz<mn[2])mn[2]=wz; if (wz>mx[2])mx[2]=wz;
        }
      });
      return { size: [mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]], center: [(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2] };
    };
    const worldPos = (o) => { const m = o.matrixWorld.elements; return [m[12], m[13], m[14]]; };

    // --- 1. the player's visual: which model + bones ---
    const vis = g.player?.model;
    out.visual = vis ? vis.constructor?.name : 'none';
    if (vis) {
      const bones = ['j_root', 'j_torso', 'j_head', 'j_wristR', 'j_wristL', 'j_ankleR', 'j_cape1', 'j_cape2'];
      out.bones = {};
      for (const b of bones) out.bones[b] = !!(vis.boneByName && vis.boneByName(b));
      // mesh names inside the visual
      const meshNames = [];
      vis.root.traverse((o) => { if (o.isMesh && meshNames.length < 8) meshNames.push(o.name); });
      out.meshNames = meshNames;
      // bbox of the visual (world, at spawn)
      const bb = bboxOf(vis.root);
      out.height = +bb.size[1].toFixed(3);
    }

    // --- 2. equip the sword (Digit1) and inspect the hand slot ---
    const press = (code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    };
    press('Digit1');
    await wait(300);
    out.sword = {};
    if (vis) {
      let found = null;
      vis.root.traverse((o) => { if (!found && (o.name === 'glb_sword' || o.userData?.glbSword)) found = o; });
      out.sword.present = !!found;
      if (found) {
        out.sword.name = found.name;
        const bb = bboxOf(found);
        out.sword.size = bb.size.map((n) => +n.toFixed(3));
        out.sword.parent = found.parent?.name ?? '?';
        out.sword.worldPos = worldPos(found).map((n) => +n.toFixed(2));
      }
    }

    // --- 3. force-equip a bow via the combat system, inspect the left hand ---
    try {
      const combat = g.combat;
      if (combat) {
        // give the player a short bow + switch to it (test-only)
        g.state.addItem?.('arco_corto');
        combat.switchTo('arco_corto');
        await wait(300);
        let bow = null;
        vis.root.traverse((o) => { if (!bow && (o.name === 'glb_bow' || o.userData?.glbBow)) bow = o; });
        out.bow = { present: !!bow };
        if (bow) {
          const bb = bboxOf(bow);
          out.bow.size = bb.size.map((n) => +n.toFixed(3));
          out.bow.parent = bow.parent?.name ?? '?';
        }
        // back to the sword
        press('Digit1');
        await wait(200);
      }
    } catch (e) { out.bowError = String(e).slice(0, 120); }

    // --- 4. FIRST PERSON toggle (B) ---
    const rig = g.rig;
    out.fpState = {
      cine: !!g.cinematics?.active,
      endings: !!g.endings?.isPlaying,
      dialogue: !!window.__kotfsStoreGet().dialogue,
      mounts: !!g.mounts?.ridingId,
      dragons: !!g.dragons?.ridingId,
    };
    out.fpBefore = rig ? !!rig.firstPerson : 'no rig';
    // SwiftShader renders so slowly that synthetic keydowns are racy against
    // the justPressed clear (e2e_f21 found this too) — drive the toggle
    // directly; the B binding is verified by code inspection + live build.
    try { if (g.cinematics?.active) g.cinematics.skip(); } catch (e) {}
    await wait(600);
    out.fpStateAfterSkip = { cine: !!g.cinematics?.active };
    try { g['toggleFirstPerson'](window.__kotfsStoreGet()); } catch (e) { out.fpErr = String(e).slice(0, 100); }
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await wait(1500);
    out.fpAfterB = rig ? !!rig.firstPerson : 'no rig';
    out.fpCamY = +(g.engine.camera.position.y - g.player.position.y).toFixed(2);
    let headScale = null;
    g.player.model.root.traverse((o) => { if (o.name === 'j_head') headScale = o.scale.x; });
    out.fpHeadScale = headScale;
    out.fpBadge = document.body.innerText.includes('FIRST PERSON');
    try { g['toggleFirstPerson'](window.__kotfsStoreGet()); } catch (e) { /* back to TP */ }
    await wait(800);
    out.fpAfterB2 = rig ? !!rig.firstPerson : 'no rig';

    // --- 5. draw calls + renderer info ---
    out.calls = g.engine?.renderer?.info?.render?.calls ?? -1;

    return out;
  }).catch(e => ({ fail: String(e).slice(0, 300) }));

  console.log(JSON.stringify(r, null, 1));
  console.log('pageErrors:', errors.length, errors.slice(0, 3));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
