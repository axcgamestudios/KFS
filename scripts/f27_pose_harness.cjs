// f27_pose_harness.cjs — deterministic pose + shot harness for Fase 27+.
//
// WHY: SwiftShader renders the full world at ~1 frame / 3 s (measured:
// rafCheck = 2 frames / 6.6 s) — any probe that waits for the live loop
// measures a FROZEN game (the F26 "walk verification" was static data).
// FIX: stop the engine loop, drive the model's update() directly with
// synthetic AnimParams (the SAME code path the game uses), park the camera
// manually, render synchronously, screenshot. Fully deterministic, fast,
// and authentic to the animation layer.
//
// Exported run(page) helpers are inline here; entry: node f27_pose_harness.cjs <job>
// Jobs: measure | shots
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f27';
fs.mkdirSync(OUT, { recursive: true });
const job = process.argv[2] ?? 'measure';
const BASE = process.argv[3] ?? 'http://localhost:3000/';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 720, height: 460 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 240)));
  page.on('crash', () => console.log('[CRASH]'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.85, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
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

  const r = await page.evaluate(async (jobArg) => {
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
    await wait(2000);

    const p = g.player;
    const m = p.model;
    const out = { phase: window.__kotfsStoreGet().phase };

    // ---- isolate the knight + stop the live loop ----
    let knightChild = m.root;
    while (knightChild.parent && knightChild.parent !== g.engine.scene) knightChild = knightChild.parent;
    let hiddenCount = 0;
    for (const c of [...g.engine.scene.children]) {
      if (c === knightChild) continue;
      const isLight = !!c.isLight;
      const isSky = /sky|sun|moon|star/i.test(c.name || '');
      if (isLight || isSky) continue;
      c.visible = false; hiddenCount++;
    }
    out.hidden = hiddenCount;
    g.engine.stop();

    // pose the player somewhere neutral
    p.position.set(24, g.world.terrainHeight.height(24, 158) + 0.1, 158);
    p.yaw = 0;

    // ---- pose driver ----
    const base = {
      dt: 1 / 30, speed: 0, moving: false, grounded: true, swimming: false,
      attackT: 0, blockT: 0, rollT: 0, bowDraw: -1, vy: 0, yawRate: 0,
    };
    const step = (over) => m.update(Object.assign({}, base, over));
    const settle = (frames, over) => { for (let i = 0; i < frames; i++) step(over); };

    // ---- measurement helpers ----
    const bp = (name) => {
      const b = m.boneByName(name);
      if (!b) return null;
      m.root.updateMatrixWorld(true);
      const e = b.matrixWorld.elements;
      return { x: e[12], y: e[13], z: e[14] };
    };
    const armSplay = (s, e2) => {
      const a = bp(s), b = bp(e2);
      if (!a || !b) return null;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      return Math.round(Math.atan2(Math.hypot(dx, dz), Math.abs(dy)) * 180 / Math.PI);
    };
    // hand (fist) lateral distance from the thigh line — knightly carry check
    const handClearance = () => {
      const w = bp('j_wristR'), hip = bp('j_hipR');
      if (!w || !hip) return null;
      return Math.round(Math.hypot(w.x - hip.x, w.z - hip.z) * 100) / 100;
    };

    // ---- camera parking ----
    const THREEV = g.engine.camera.position.constructor;
    const park = (yawDeg, pitchDeg, dist, focusY = 1.05) => {
      const yaw = yawDeg * Math.PI / 180, pitch = pitchDeg * Math.PI / 180;
      const cx = p.position.x - Math.sin(yaw) * Math.cos(pitch) * dist;
      const cz = p.position.z - Math.cos(yaw) * Math.cos(pitch) * dist;
      const cy = p.position.y + focusY + Math.sin(pitch) * dist;
      g.engine.camera.position.set(cx, cy, cz);
      const look = new THREEV(p.position.x, p.position.y + focusY, p.position.z);
      g.engine.camera.lookAt(look);
      g.engine.camera.updateMatrixWorld(true);
    };
    const render = () => {
      m.root.updateMatrixWorld(true);
      g.engine.renderer.render(g.engine.scene, g.engine.camera);
    };

    // ================================================================
    if (jobArg === 'blade') {
      // numeric blade-direction probe (character frame: +Z forward, +Y up)
      // across idle / windups / strikes / thrust — the F25/F26 standard,
      // re-run because the F27 rest change rotated the whole arm inboard.
      let sword = null;
      m.root.traverse((o) => { if (!sword && o.userData?.heroSword) sword = o; });
      if (!sword) m.root.traverse((o) => { if (!sword && /sword/i.test(o.name || '')) sword = o; });
      out.swordName = sword ? sword.name : null;
      const dirOf = () => {
        m.root.updateMatrixWorld(true);
        const v = new (g.engine.camera.position.constructor)(0, 1, 0);
        v.transformDirection(sword.matrixWorld);
        return [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];
      };
      const attackSeq = (kind, t) => {
        settle(50, {});
        for (let i = 0; i <= Math.round(t * 40); i++) {
          m.update(Object.assign({}, base, { attackT: i / 40, attackDur: 0.5, attackKind: kind }));
        }
      };
      settle(90, {});
      out.idle = dirOf();
      attackSeq('light1', 0.20); out.light1_windup = dirOf();
      attackSeq('light1', 0.55); out.light1_strike = dirOf();
      attackSeq('heavy', 0.35);  out.heavy_windup = dirOf();
      attackSeq('thrust', 0.55); out.thrust = dirOf();
      attackSeq('light2', 0.55); out.light2_strike = dirOf();
      // re-shoot the strike MOMENT for the VLM
      out._strikeShot = true;
      attackSeq('light1', 0.55);
      park(42, 6, 3.0, 1.15);
      render();
      await wait(160);
      await window.saveShot('attack_strike_mid');
      g.engine.start();
      return out;
    }

    // ================================================================
    if (jobArg === 'gait') {
      // objective gait table: walk a full cycle, dump joint angles + foot
      // geometry (heel/toe world height, foot pitch) every 1/12th cycle
      settle(60, {});
      const rows = [];
      const ankleB = m.boneByName('j_ankleR');
      for (let f = 0; f < 260; f++) {
        step({ moving: true, speed: 2.2 });
        if (f > 100) {
          const ph = m.phase % (Math.PI * 2);
          if (rows.length < 12 && (f - 101) % 13 === 0) {
            m.root.updateMatrixWorld(true);
            const rootW = m.root.getWorldPosition(new (g.engine.camera.position.constructor)());
            const rootY = rootW.y;
            // skinned foot extremes: sample sabaton vertices of the RIGHT foot
            let minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
            // ankle world position as proxy joint
            const a = bp('j_ankleR');
            const rows_push = {
              ph: Math.round(ph * 100) / 100,
              hip: Math.round(m.boneByName('j_hipR').rotation.x * 100) / 100,
              knee: Math.round(m.boneByName('j_kneeR').rotation.x * 100) / 100,
              ankle: Math.round(ankleB.rotation.x * 100) / 100,
              ankleY: Math.round((a.y - rootY) * 100) / 100,
              hipY: Math.round((bp('j_hipR').y - rootY) * 100) / 100,
            };
            // foot mesh sampling via skinned vertex read (right sabaton)
            try {
              const mesh = m.root.getObjectByName('knight_body');
              if (mesh && mesh.isSkinnedMesh) {
                const geo = mesh.geometry;
                const pos = geo.attributes.position;
                const skinW = geo.attributes.skinWeight;
                const skinI = geo.attributes.skinIndex;
                const bonesArr = mesh.skeleton.bones;
                const ankleIdx = bonesArr.indexOf(ankleB);
                const v = new (g.engine.camera.position.constructor)();
                let count = 0, toeZ = -1e9, toeY = 0, heelZ = 1e9, heelY = 0;
                for (let i = 0; i < pos.count; i += 1) {
                  // weight on the ankle bone in EITHER slot (foot region)
                  const wX = skinI.getX(i) === ankleIdx ? skinW.getX(i) : 0;
                  const wY = skinI.getY(i) === ankleIdx ? skinW.getY(i) : 0;
                  if (wX + wY > 0.4) {
                    v.fromBufferAttribute(pos, i);
                    mesh.applyBoneTransform(i, v);
                    const ly = v.y - rootY;
                    if (ly < 0.28) {
                      count++;
                      if (v.z > toeZ) { toeZ = v.z; toeY = ly; }
                      if (v.z < heelZ) { heelZ = v.z; heelY = ly; }
                      if (ly < minY) minY = ly;
                    }
                  }
                }
                rows_push.foot = {
                  verts: count,
                  toeY: Math.round(toeY * 1000) / 1000,
                  heelY: Math.round(heelY * 1000) / 1000,
                  pitchDeg: Math.round(Math.atan2(toeY - heelY, toeZ - heelZ) * 180 / Math.PI),
                  minY: Math.round(minY * 1000) / 1000,
                };
              }
            } catch (e) { rows_push.footErr = String(e).slice(0, 80); }
            rows.push(rows_push);
          }
        }
      }
      out.gait = rows;
      g.engine.start();
      return out;
    }

    // ================================================================
    if (jobArg === 'measure') {
      // --- idle ---
      settle(90, {});
      out.idle = {
        splayL: armSplay('j_shoulderL', 'j_elbowL'),
        splayR: armSplay('j_shoulderR', 'j_elbowR'),
        handClear: handClearance(),
      };
      const shR = m.boneByName('j_shoulderR'), elR = m.boneByName('j_elbowR');
      out.idle.rot = {
        shoulderR: [shR.rotation.x, shR.rotation.y, shR.rotation.z].map(v => Math.round(v * 100) / 100),
        elbowR: [elR.rotation.x, elR.rotation.y, elR.rotation.z].map(v => Math.round(v * 100) / 100),
      };

      // --- walk at 2.2 m/s (the game's walk speed) ---
      const ws = [];
      let maxSwingSh = 0, samples = [];
      for (let f = 0; f < 150; f++) {
        step({ moving: true, speed: 2.2 });
        if (f > 60 && f % 6 === 0) {
          const s = {
            f,
            splayL: armSplay('j_shoulderL', 'j_elbowL'),
            splayR: armSplay('j_shoulderR', 'j_elbowR'),
            handClear: handClearance(),
            shRx: Math.round(m.boneByName('j_shoulderR').rotation.x * 100) / 100,
            shRz: Math.round(m.boneByName('j_shoulderR').rotation.z * 100) / 100,
          };
          samples.push(s);
          maxSwingSh = Math.max(maxSwingSh, Math.abs(s.shRx));
        }
      }
      out.walk = { samples, maxShSwing: Math.round(maxSwingSh * 100) / 100 };

      // --- run at 6.2 m/s ---
      const rs = [];
      for (let f = 0; f < 120; f++) {
        step({ moving: true, speed: 6.2 });
        if (f > 60 && f % 8 === 0) {
          rs.push({
            splayR: armSplay('j_shoulderR', 'j_elbowR'),
            handClear: handClearance(),
          });
        }
      }
      out.run = rs;

      // --- sword check ---
      out.sword = {};
      try {
        let sw = null;
        m.root.traverse((o) => { if (!sw && (o.name === 'glb_sword' || o.userData?.heroSword)) sw = o; });
        out.sword.present = !!sw;
        out.sword.name = sw ? (sw.name || 'unnamed') : null;
        if (sw) {
          const box = new (window.__three?.Box3 ?? Object)();
          out.sword.note = 'object found';
        }
      } catch (e) { out.sword.err = String(e); }
      g.engine.start();
      return out;
    }

    // ================================================================
    if (jobArg.startsWith('shots')) {
      // walk phase index: the stride period is 2π in phase; park exact
      // gait instants by stepping until (this.phase mod 2π) hits a target.
      const walkTo = async (target, speed = 2.2) => {
        for (let guard = 0; guard < 400; guard++) {
          step({ moving: true, speed });
          const ph = m.phase % (Math.PI * 2);
          if (ph >= target && ph - (1 / 30) * (6.6) <= target + 0.001) break;
          if (ph < target && guard > 380) break;
        }
      };
      const shots = [
        // idle 3/4 front-right
        { name: 'idle_3q', pose: () => settle(100, {}), cam: [38, 10, 2.9], focus: 1.05 },
        // walk — front 3/4 (arms + sword read)
        { name: 'walk_front', pose: () => { settle(40, {}); for (let i = 0; i < 96; i++) step({ moving: true, speed: 2.2 }); }, cam: [55, 8, 2.6], focus: 1.0 },
        // walk cycle — side view at 6 phases (0 = right heel strike)
        { name: 'walk_p0_strike', pose: () => { settle(40, {}); walkTo(0.05); }, cam: [8, 6, 2.8], focus: 0.95 },
        { name: 'walk_p1_load', pose: () => walkTo(0.7), cam: [8, 6, 2.8], focus: 0.95 },
        { name: 'walk_p2_mid', pose: () => walkTo(1.6), cam: [8, 6, 2.8], focus: 0.95 },
        { name: 'walk_p3_off', pose: () => walkTo(2.6), cam: [8, 6, 2.8], focus: 0.95 },
        { name: 'walk_p4_swing', pose: () => walkTo(3.8), cam: [8, 6, 2.8], focus: 0.95 },
        { name: 'walk_p5_reach', pose: () => walkTo(5.4), cam: [8, 6, 2.8], focus: 0.95 },
        // walk — front low (knee plates at contact)
        { name: 'walk_knee', pose: () => walkTo(0.5), cam: [50, -4, 1.7], focus: 0.55 },
        // run — side
        { name: 'run_side', pose: () => { for (let i = 0; i < 70; i++) step({ moving: true, speed: 6.2 }); }, cam: [12, 8, 3.0], focus: 1.0 },
        // attack light1 strike moment
        { name: 'attack_strike', pose: () => { settle(60, {}); for (let i = 0; i <= 10; i++) m.update(Object.assign({}, base, { attackT: i / 10, attackDur: 0.5, attackKind: 'light1' })); }, cam: [42, 6, 3.0], focus: 1.15 },
      ];
      const filter = jobArg.includes(':') ? jobArg.split(':')[1] : null;
      for (const s of shots) {
        if (filter && !s.name.includes(filter)) continue;
        s.pose();
        park(s.cam[0], s.cam[1], s.cam[2], s.focus ?? 1.0);
        render();
        await wait(160); // let the compositor latch the presented frame
        await window.saveShot(s.name);
      }
      g.engine.start();
      return { shots: shots.filter(s => !filter || s.name.includes(filter)).map(s => s.name) };
    }

    return { fail: 'unknown job ' + jobArg };
  }, job).catch((e) => ({ fail: String(e) }));

  fs.writeFileSync('/tmp/f27_harness_out.json', JSON.stringify(r, null, 1));
  console.log('harness done ->', JSON.stringify(r).slice(0, 260));
  await browser.close();
})();
