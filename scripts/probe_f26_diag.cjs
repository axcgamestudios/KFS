// probe_f26_diag.cjs — Fase 26 diagnosis of the user report:
//   "Las animaciones del jugador estan horribles, camina rarisimo, y como que
//    se estiran sus pies al caminar, y la posicion de los brazos rara y tieza.
//    y tampoco tiene la espada en la mano, nisiquiera sale."
// Measures (no guessing — live runtime geometry):
//   A. SWORD CHAIN — console [F25] logs, equippedWeapon, glb_sword presence,
//      parent chain, visible, scale, world position (right hand).
//   B. ARM REST SPLAY — shoulder/elbow/wrist world positions + upper-arm
//      angle from vertical at idle (A-pose bind would read ~26 deg out).
//   C. FOOT SKINNING DURING WALK — manual skinning of the body mesh's foot
//      vertices; toe-tip to ankle distance over the stride (rigid foot:
//      constant; toe pinned to root: oscillates = the stretch the user sees).
//   D. Screenshots: idle_3q (arms+sword), walk_side (feet), walk_front.
// Usage: node probe_f26_diag.cjs [data|shot:idle_3q|shot:walk_side|shot:walk_front|shot:sword_close]
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f26';
fs.mkdirSync(OUT, { recursive: true });
const mode = process.argv[2] ?? 'data';
const BASE = process.argv[3] ?? 'http://localhost:3000/';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 880, height: 520 } });
  const f25logs = [];
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 240)));
  page.on('crash', () => console.log('[CRASH]'));
  page.on('console', m => { const t = m.text(); if (/\[F25\]/i.test(t)) f25logs.push(t.slice(0, 120)); });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.9, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.exposeFunction('saveShot', async (n) => {
    await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 150000 });
    console.log('shot saved:', n);
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const r = await page.evaluate(async ([mode]) => {
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
    try { if (g.cinematics?.active) g.cinematics.skip(); } catch (e) {}
    await wait(2500);

    const p = g.player;
    const m = p.model;
    const out = { phase: window.__kotfsStoreGet().phase, f25logs: [] };

    // place on flat ground near the village, facing +Z
    const flat = (x, z) => { p.position.set(x, g.world.terrainHeight.height(x, z) + 0.1, z); p.yaw = 0; };
    const drive = (on) => { try { if (on) g.input.keys.add('KeyW'); else g.input.keys.delete('KeyW'); } catch (e) {} };
    const parkFollow = (yaw, pitch, dist) => {
      g.rig.yaw = yaw; g.rig.pitch = pitch;
      g.rig.distance = dist; g.rig.targetDistance = dist;
    };

    // ---------- A. SWORD CHAIN ----------
    out.sword = {};
    try {
      out.sword.equippedWeapon = g.state?.equippedWeapon ?? null;
      out.sword.hasItem = g.state?.hasItem ? g.state.hasItem('espada_acero') : null;
      let found = null, handSlot = null;
      m.root.traverse((o) => {
        if (!found && (o.name === 'glb_sword' || o.userData?.glbSword)) found = o;
        if (o.name === 'handSlot' || (o.children && o.children.length && o.parent === m.boneByName('j_wristR'))) {
          if (!handSlot && o !== found) handSlot = o;
        }
      });
      // find the actual hand slot: the group parented to j_wristR that is not a bone
      const wr = m.boneByName('j_wristR');
      out.sword.wristChildren = wr ? wr.children.map((c) => c.name || c.type) : [];
      out.sword.present = !!found;
      if (found) {
        out.sword.parent = found.parent?.name ?? found.parent?.type;
        out.sword.visible = found.visible;
        found.updateMatrixWorld(true);
        const e = found.matrixWorld.elements;
        out.sword.worldPos = [+e[12].toFixed(3), +e[13].toFixed(3), +e[14].toFixed(3)];
        out.sword.scale = found.scale.toArray().map((n) => +n.toFixed(3));
        out.sword.meshCount = 0; found.traverse((o) => { if (o.isMesh) out.sword.meshCount++; });
        out.sword.matVisible = [];
        found.traverse((o) => { if (o.isMesh && out.sword.matVisible.length < 3) out.sword.matVisible.push(o.visible); });
      }
      // any sword-prop fallback visible?
      out.sword.statueSword = !!m.root.traverse && null;
    } catch (e) { out.sword.err = String(e).slice(0, 160); }

    // ---------- B. ARM REST SPLAY (idle) ----------
    try {
      flat(24, 162);
      await wait(2200); // settle into idle
      const bonePos = (n) => { const b = m.boneByName(n); if (!b) return null; b.updateMatrixWorld(true); const e = b.matrixWorld.elements; return [e[12], e[13], e[14]]; };
      const sh = bonePos('j_shoulderR'), el = bonePos('j_elbowR'), wr2 = bonePos('j_wristR');
      const shL = bonePos('j_shoulderL'), elL = bonePos('j_elbowL'), wrL = bonePos('j_wristL');
      const ang = (a, b) => { if (!a || !b) return null; const dx = b[0] - a[0], dy = b[1] - a[1]; return +(Math.atan2(Math.abs(dx), Math.abs(dy)) * 180 / Math.PI).toFixed(1); };
      out.arms = {
        shoulderR: sh, elbowR: el, wristR: wr2,
        upperArmOutDeg: ang(sh, el), forearmInDeg: ang(el, wr2),
        upperArmOutDegL: ang(shL, elL), forearmInDegL: ang(elL, wrL),
        wristR_world: wr2,
      };
    } catch (e) { out.arms = { err: String(e).slice(0, 160) }; }

    // ---------- C. FOOT SKINNING DURING WALK ----------
    try {
      // body skinned mesh
      let body = null;
      m.root.traverse((o) => { if (!body && o.isSkinnedMesh && /body/i.test(o.name)) body = o; });
      if (!body) m.root.traverse((o) => { if (!body && o.isSkinnedMesh) body = o; });
      out.foot = { mesh: body ? body.name : 'none' };
      if (body) {
        const geo = body.geometry;
        const pos = geo.attributes.position.array;
        const si = geo.attributes.skinIndex ? geo.attributes.skinIndex.array : null;
        const sw = geo.attributes.skinWeight ? geo.attributes.skinWeight.array : null;
        const bones = body.skeleton.bones;
        const invs = body.skeleton.boneInverses;
        // bind-space foot vertices: y<0.17, |x|<0.30 (sabatons + boot)
        const footIdx = [];
        for (let i = 0; i < geo.attributes.position.count; i++) {
          if (pos[i * 3 + 1] < 0.17 && Math.abs(pos[i * 3]) < 0.30) footIdx.push(i);
        }
        out.foot.footVerts = footIdx.length;
        // toe tip = the foot vertex with max bind z per side
        let toeR = -1, toeRz = -1e9, toeL = -1, toeLz = 1e9;
        for (const i of footIdx) {
          if (pos[i * 3] < 0 && pos[i * 3 + 2] > toeRz) { toeRz = pos[i * 3 + 2]; toeR = i; }
          if (pos[i * 3] > 0 && pos[i * 3 + 2] > toeLz) { toeLz = pos[i * 3 + 2]; toeL = i; }
        }
        const skinned = (i) => {
          // v = bind pose local -> world via skinning
          const vx = pos[i * 3], vy = pos[i * 3 + 1], vz = pos[i * 3 + 2];
          let ox = 0, oy = 0, oz = 0, wsum = 0;
          for (let k = 0; k < 4; k++) {
            const w = sw[i * 4 + k];
            if (w <= 0) continue;
            const b = bones[si[i * 4 + k]];
            b.updateMatrixWorld(true);
            const bm = b.matrixWorld.elements, iv = invs[si[i * 4 + k]].elements;
            // p_local = boneInv * v
            const px = iv[0] * vx + iv[4] * vy + iv[8] * vz + iv[12];
            const py = iv[1] * vx + iv[5] * vy + iv[9] * vz + iv[13];
            const pz = iv[2] * vx + iv[6] * vy + iv[10] * vz + iv[14];
            // p_world = bone * p_local
            ox += w * (bm[0] * px + bm[4] * py + bm[8] * pz + bm[12]);
            oy += w * (bm[1] * px + bm[5] * py + bm[9] * pz + bm[13]);
            oz += w * (bm[2] * px + bm[6] * py + bm[10] * pz + bm[14]);
            wsum += w;
          }
          if (wsum > 0) { ox /= wsum; oy /= wsum; oz /= wsum; }
          return [ox, oy, oz];
        };
        const bonePos2 = (n) => { const b = m.boneByName(n); if (!b) return null; b.updateMatrixWorld(true); const e = b.matrixWorld.elements; return [e[12], e[13], e[14]]; };
        // walk along +Z (drive the input set directly — synthetic events are racy)
        flat(24, 158);
        drive(true);
        const series = [];
        for (let s = 0; s < 26; s++) {
          await wait(110);
          const ankR = bonePos2('j_ankleR'), ankL = bonePos2('j_ankleL');
          const tR = toeR >= 0 ? skinned(toeR) : null;
          const tL = toeL >= 0 ? skinned(toeL) : null;
          // foot region z-spread along world Z (walking direction), per side
          let zMin = 1e9, zMax = -1e9, xMin = 1e9, xMax = -1e9;
          for (const i of footIdx) {
            const w2 = skinned(i);
            if (w2[2] < zMin) zMin = w2[2]; if (w2[2] > zMax) zMax = w2[2];
            if (w2[0] < xMin) xMin = w2[0]; if (w2[0] > xMax) xMax = w2[0];
          }
          const d = (a, b) => (a && b ? +Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(3) : null);
          series.push({
            t: s,
            speed: +p.speedSm.toFixed(2),
            pos: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)],
            toeToAnkleR: d(tR, ankR), toeToAnkleL: d(tL, ankL),
            footSpanZ: +(zMax - zMin).toFixed(3), footSpanX: +(xMax - xMin).toFixed(3),
            toeWorldZ: tR ? +tR[2].toFixed(3) : null,
          });
        }
        drive(false);
        out.foot.series = series;
        const spans = series.slice(8).map((s2) => s2.footSpanZ);
        out.foot.spanZmin = +Math.min(...spans).toFixed(3);
        out.foot.spanZmax = +Math.max(...spans).toFixed(3);
        const dts = series.slice(8).map((s2) => s2.toeToAnkleR).filter((v) => v != null);
        if (dts.length) { out.foot.toeAnkleRmin = +Math.min(...dts).toFixed(3); out.foot.toeAnkleRmax = +Math.max(...dts).toFixed(3); }
      }
    } catch (e) { out.foot = { err: String(e).slice(0, 200) }; }

    // ---------- D. screenshots ----------
    const wantShot = /^shot:|bownum/.test(String(mode)) ? String(mode).replace(/^shot:/, '') : null;
    if (wantShot === 'idle_3q') {
      flat(24, 162); parkFollow(-Math.PI / 2 + 0.35, 0.14, 3.3);
      for (let i = 0; i < 10; i++) await wait(320);
      await window.saveShot('idle_3q');
    } else if (wantShot === 'sword_close') {
      flat(24, 162); parkFollow(-Math.PI / 2 + 0.75, 0.28, 1.55);
      for (let i = 0; i < 10; i++) await wait(320);
      await window.saveShot('sword_close');
    } else if (wantShot === 'attack' || wantShot === 'windup' || wantShot === 'thrust') {
      flat(24, 162);
      g.state.addItem('espada_acero');
      g.state.equip('espada_acero');
      g.combat.refreshVisuals();
      parkFollow(-Math.PI / 2 + 0.35, 0.16, 3.1);
      const sh = m.boneByName('j_shoulderR');
      const cfg = wantShot === 'attack' ? { kind: 'light1', t: 0.78, want: -0.25 }
        : wantShot === 'thrust' ? { kind: 'thrust', t: 0.75, want: -1.5 }
        : { kind: 'heavy', t: 0.26, want: -1.8 };
      p.attackKind = cfg.kind; p.attackDur = 99999; p.attackT = cfg.t;
      let ok = false;
      for (let i = 0; i < 30; i++) {
        await wait(300);
        if (sh.rotation.x < cfg.want) { ok = true; break; }
      }
      for (let i = 0; i < 3; i++) await wait(350);
      await window.saveShot(wantShot);
      p.attackT = 0; p.attackDur = 0;
    } else if (wantShot === 'bownum') {
      flat(24, 162);
      g.state.addItem('arco_corto');
      g.combat.switchTo('arco_corto');
      parkFollow(-Math.PI / 2 + 0.5, 0.12, 3.0);
      p.bowDraw = 0.9; p.bowAiming = true;
      for (let i = 0; i < 22; i++) await wait(400);
      let bow = null;
      m.root.traverse((o) => { if (!bow && (o.userData?.glbBow || o.name === 'glb_bow')) bow = o; });
      out.bow = null;
      if (bow) {
        bow.updateWorldMatrix(true, false);
        const mm = bow.matrixWorld.elements;
        const mul = (x, y, z) => [mm[0]*x+mm[4]*y+mm[8]*z, mm[1]*x+mm[5]*y+mm[9]*z, mm[2]*x+mm[6]*y+mm[10]*z];
        const top = mul(0, 0.71, 0), bot = mul(0, -0.71, 0);
        let ax = [top[0]-bot[0], top[1]-bot[1], top[2]-bot[2]];
        const l = Math.hypot(...ax) || 1;
        out.bow = {
          localRot: bow.rotation.toArray().slice(0, 3).map((n) => +n.toFixed(3)),
          limbAxisChar: { x: +(ax[0]/l).toFixed(3), y: +(ax[1]/l).toFixed(3), z: +(ax[2]/l).toFixed(3) },
          stringSide: mul(-0.05, 0, 0),
        };
        // also the string side direction in char frame
        const pp = p.position, yaw = p.yaw;
        const loc = (v) => { const dx=v[0]-pp.x, dz=v[2]-pp.z; return [Math.cos(yaw)*dx - Math.sin(yaw)*dz, Math.sin(yaw)*dx + Math.cos(yaw)*dz]; };
        const sa = loc(out.bow.stringSide);
        out.bow.stringSideChar = { x: +sa[0].toFixed(3), z: +sa[1].toFixed(3) };
        p.bowAiming = false; p.bowDraw = 0;
      }
    } else if (wantShot === 'bowdraw') {
      flat(24, 162);
      g.state.addItem('arco_corto');
      g.combat.switchTo('arco_corto');
      parkFollow(-Math.PI / 2 + 0.5, 0.12, 3.0);
      p.bowDraw = 0.9; p.bowAiming = true;
      for (let i = 0; i < 10; i++) await wait(320);
      await window.saveShot('bowdraw');
      p.bowAiming = false; p.bowDraw = 0;
    } else if (wantShot === 'walk_side') {
      flat(24, 156); parkFollow(0, 0.06, 2.1); // side view, low camera on the feet
      drive(true);
      for (let i = 0; i < 40 && p.speedSm < 3.4; i++) await wait(300);
      for (let i = 0; i < 4; i++) await wait(260);
      await window.saveShot('walk_side');
      drive(false);
    } else if (wantShot === 'walk_front') {
      flat(24, 156); parkFollow(-Math.PI / 2, 0.10, 2.6);
      drive(true);
      for (let i = 0; i < 40 && p.speedSm < 3.4; i++) await wait(300);
      for (let i = 0; i < 4; i++) await wait(260);
      await window.saveShot('walk_front');
      drive(false);
    }
    out.f25logs = [];
    return out;
  }, [mode]).catch((e) => ({ fail: String(e) }));

  if (r && typeof r === 'object') r.f25logs = f25logs;
  const full = JSON.stringify(r, null, 1);
  fs.writeFileSync('/home/z/my-project/scripts/probe_f26_out.json', full);
  console.log(full.slice(0, 3500));
  console.log('... full JSON written to scripts/probe_f26_out.json');
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
