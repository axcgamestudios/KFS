// probe_f24_sword.cjs — diagnose the sword grip + swing direction + attack pop.
// Runs the LIVE dev build at localhost:3000, equips the starting sword,
// holds key attack poses and measures the BLADE's world direction, plus
// detects the attack-start pose teleport (the "pop") and the idle damp
// erosion of the grip pitch.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f24';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const report = { checks: [] };
const check = (name, data) => { report.checks.push({ name, ...data }); console.log('[CHECK]', name, JSON.stringify(data)); };

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 720, height: 405 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 250)));
  page.on('crash', () => console.log('[CRASH] renderer crashed'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 2, reflections: 0,
        postfx: false, resolution: 0.7, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.exposeFunction('saveShot', async (n) => {
    await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 150000 });
    console.log('shot saved:', n);
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const log = (...a) => console.log('[f24]', ...a);
    const g = window.__kotfsGame;
    if (!g) return 'no game';
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
    const out = { boot: 'ok' };

    // ---- place on the village green, face +Z (yaw 0), equip steel sword ----
    const p = g.player;
    const h = g.world.terrainHeight.height(24, 152);
    p.position.set(24, h + 0.1, 152);
    p.yaw = 0;
    p.velocity?.set?.(0, 0, 0);
    g.state.addItem('espada_acero');
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    await wait(2000); // let the streaming settle

    // ---- tiny matrix helpers (no THREE on window) ----
    const mulPoint = (m, x, y, z) => [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
    const findSword = () => {
      let sw = null;
      g.player.model.root.traverse((o) => { if (!sw && o.name === 'hero_sword') sw = o; });
      return sw;
    };
    const sample = () => {
      const sw = findSword();
      if (!sw) return { err: 'no sword found' };
      sw.updateWorldMatrix(true, false);
      const m = sw.matrixWorld.elements;
      const tip = mulPoint(m, 0, 0.88, 0);   // blade tip (blade +Y, 0.9 long)
      const grip = mulPoint(m, 0, 0.0, 0);   // grip centre
      const pommel = mulPoint(m, 0, -0.17, 0);
      const pp = p.position;
      // character-local frame: character faces its yaw. forward = (sin yaw, 0, cos yaw)
      const yaw = p.yaw;
      const loc = (v) => {
        const dx = v[0] - pp.x, dz = v[2] - pp.z;
        return { x: Math.cos(yaw) * dx - Math.sin(yaw) * dz, z: Math.sin(yaw) * dx + Math.cos(yaw) * dz, y: v[1] - pp.y };
      };
      const tipL = loc(tip), gripL = loc(grip);
      let dirL = { x: tipL.x - gripL.x, y: tipL.y - gripL.y, z: tipL.z - gripL.z };
      const len = Math.hypot(dirL.x, dirL.y, dirL.z) || 1;
      dirL = { x: +(dirL.x / len).toFixed(3), y: +(dirL.y / len).toFixed(3), z: +(dirL.z / len).toFixed(3) };
      // rotation.x of the sword itself (the damp erosion target)
      return {
        bladeLocalDir: dirL,          // +z = forward (at the enemy), -z = backwards
        gripLocal: { x: +gripL.x.toFixed(3), y: +gripL.y.toFixed(3), z: +gripL.z.toFixed(3) },
        swordRotX: +sw.rotation.x.toFixed(3),
        swordScale: +sw.scale.y.toFixed(2),
      };
    };
    out.samples = {};

    // ---- 1. idle, fresh after equip ----
    out.samples.idleFresh = sample();
    await wait(2600);
    // ---- 2. idle after ~2.9s (damp erosion?) ----
    out.samples.idleEroded = sample();

    // helper: hold an attack pose
    const holdPose = async (kind, k, ms) => {
      p.attackKind = kind; p.attackDur = 99999; p.attackT = k;
      await wait(ms);
    };

    // ---- 3. light1 windup (blade should cock BACK over the shoulder: -z, +y) ----
    await holdPose('light1', 0.32, 450);
    out.samples.light1Windup = sample();
    // ---- 4. light1 strike mid (blade should cut FORWARD: +z, slight -y) ----
    await holdPose('light1', 0.56, 450);
    out.samples.light1Strike = sample();

    // ---- 5. thrust full extension (blade forward: +z strong) ----
    await holdPose('thrust', 0.50, 450);
    out.samples.thrustStrike = sample();

    // ---- 6. heavy windup (blade up-back: -z, +y) ----
    await holdPose('heavy', 0.38, 450);
    out.samples.heavyWindup = sample();

    p.attackT = 0; p.attackDur = 0.6;
    await wait(900);

    // ---- 7. the attack-start POP detector: walk, then fire light1, ----
    // ---- sample shoulderR.x every frame for 500ms ---------------------
    const shoulder = g.player.model.boneByName('j_shoulderR');
    const samples = [];
    let t0 = null;
    const sampler = () => {
      const now = performance.now();
      if (t0 === null) t0 = now;
      samples.push({ t: +(now - t0).toFixed(0), sx: +shoulder.rotation.x.toFixed(3) });
      if (now - t0 < 520) requestAnimationFrame(sampler);
      else {
        // find the biggest single-frame jump
        let worst = 0, worstAt = 0;
        for (let i = 1; i < samples.length; i++) {
          const d = Math.abs(samples[i].sx - samples[i - 1].sx);
          if (d > worst) { worst = d; worstAt = samples[i].t; }
        }
        out.pop = { worstJump: +worst.toFixed(3), atMs: worstAt, n: samples.length,
          series: samples.filter((_, i) => i % 4 === 0).slice(0, 30) };
      }
    };
    // make him walk forward for a beat first
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    await wait(600);
    p.attackKind = 'light1'; p.attackDur = 0.5; p.attackT = 0.001;
    requestAnimationFrame(sampler);
    await wait(900);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
    p.attackT = 0;
    await wait(400);

    // ---- 8. camera shots: side view of the grip + a mid-strike ----
    // side view (right side = -X of the character): camera west of him
    g.rig.freeCam = true;
    g.rig.freePos.set(p.position.x - 3.4, p.position.y + 1.45, p.position.z + 0.4);
    g.rig.yaw = -Math.PI / 2;  // look +X toward him
    g.rig.pitch = -0.06;
    await wait(700);
    await holdPose('light1', 0.34, 400); // windup shot
    await window.saveShot('f24_windup_side');
    await holdPose('light1', 0.56, 400); // strike shot
    await window.saveShot('f24_strike_side');
    p.attackT = 0; p.attackDur = 0.6;
    await wait(1200); // idle settle
    await window.saveShot('f24_idle_side');

    out.finalSample = sample();
    return out;
  }).catch((e) => ({ err: String(e) }));

  check('swordDiag', r);
  fs.writeFileSync('/home/z/my-project/scripts/f24_sword_diag.json', JSON.stringify(report, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
