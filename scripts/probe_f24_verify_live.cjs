// probe_f24_verify.cjs — verify the F24 sword grip + swing direction +
// attack blend fixes. Waits REAL animation frames between pose holds
// (the first probe's waits could fall between throttled frames and the
// samples went stale).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f24';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const report = { checks: [] };
const check = (name, data) => { report.checks.push({ name, ...data }); console.log('[CHECK]', name, JSON.stringify(data)); };

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1700',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
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
  await page.goto('https://axcgamestudios.github.io/KFS/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const log = (...a) => console.log('[f24v]', ...a);
    // wait N REAL animation frames (timeout guard 8s)
    const waitFrames = (n) => new Promise((res) => {
      const t0 = performance.now(); let c = 0;
      const tick = () => {
        if (++c >= n || performance.now() - t0 > 8000) res();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
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

    // ---- place on the village green, face +Z, equip steel sword ----
    const p = g.player;
    const h = g.world.terrainHeight.height(24, 152);
    p.position.set(24, h + 0.1, 152);
    p.yaw = 0;
    g.state.addItem('espada_acero');
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    await waitFrames(30); // ~1s of real frames to settle streaming

    const mulPoint = (m, x, y, z) => [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
    const findSword = () => {
      let sw = null;
      g.player.model.root.traverse((o) => { if (!sw && (o.name === 'hero_sword' || o.name.startsWith('spear'))) sw = o; });
      return sw;
    };
    const sample = () => {
      const sw = findSword();
      if (!sw) return { err: 'no weapon found' };
      sw.updateWorldMatrix(true, false);
      const m = sw.matrixWorld.elements;
      const tip = mulPoint(m, 0, 0.88, 0);
      const grip = mulPoint(m, 0, 0.0, 0);
      const pp = p.position;
      const yaw = p.yaw;
      const loc = (v) => ({
        x: Math.cos(yaw) * (v[0] - pp.x) - Math.sin(yaw) * (v[2] - pp.z),
        z: Math.sin(yaw) * (v[0] - pp.x) + Math.cos(yaw) * (v[2] - pp.z),
        y: v[1] - pp.y,
      });
      const tipL = loc(tip), gripL = loc(grip);
      let d = { x: tipL.x - gripL.x, y: tipL.y - gripL.y, z: tipL.z - gripL.z };
      const len = Math.hypot(d.x, d.y, d.z) || 1;
      d = { x: +(d.x / len).toFixed(3), y: +(d.y / len).toFixed(3), z: +(d.z / len).toFixed(3) };
      const fist = g.player.model.boneByName('j_wristR');
      const fistL = fist ? loc(mulPoint(fist.matrixWorld.elements, 0, 0, 0)) : null;
      return {
        bladeLocalDir: d,   // +z = at the enemy, -z = backwards
        gripOffsetFromFist: fistL ? +Math.hypot(gripL.x - fistL.x, gripL.y - fistL.y, gripL.z - fistL.z).toFixed(3) : -1,
        swordRotX: +sw.rotation.x.toFixed(3),
      };
    };
    out.samples = {};

    // 1. idle fresh
    await waitFrames(4);
    out.samples.idleFresh = sample();
    // 2. idle after ~3 more seconds — the erosion check (must stay ~1.52)
    await waitFrames(90);
    out.samples.idleEroded = sample();

    // hold an attack pose and wait REAL frames
    const holdPose = async (kind, k, frames = 5) => {
      p.attackKind = kind; p.attackDur = 99999; p.attackT = k;
      await waitFrames(frames);
      return sample();
    };
    // 3-6. sword: light1 windup / strike / thrust extension / heavy windup
    out.samples.light1Windup = await holdPose('light1', 0.32);
    out.samples.light1Strike = await holdPose('light1', 0.56);
    out.samples.thrustExt = await holdPose('thrust', 0.52);
    out.samples.heavyWindup = await holdPose('heavy', 0.38);
    p.attackT = 0;
    await waitFrames(20);

    // 7. the blend unit test: capture walk pose, then check the interpolation
    //    at b≈0 (elapsed 2ms) and b≈0.5 (elapsed 45ms) is BETWEEN, not at the target
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    await waitFrames(30);
    const sh = g.player.model.boneByName('j_shoulderR');
    const walkX = +sh.rotation.x.toFixed(3);
    p.attackKind = 'light1'; p.attackDur = 0.5; p.attackT = 0.004; // elapsed 2ms → b≈0
    await waitFrames(2);
    const blend0 = +sh.rotation.x.toFixed(3);
    p.attackT = 0.09; // elapsed 45ms → b≈0.5
    await waitFrames(2);
    const blendHalf = +sh.rotation.x.toFixed(3);
    p.attackT = 0.4; // past the blend → full windup/strike curve
    await waitFrames(2);
    const full = +sh.rotation.x.toFixed(3);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
    p.attackT = 0;
    out.samples.blendTest = { walkX, blend0, blendHalf, full };
    await waitFrames(15);

    // 8. spear: equip, idle + thrust extension
    g.state.addItem('lanza_caza');
    g.state.equip('lanza_caza');
    g.combat.refreshVisuals();
    await waitFrames(8);
    out.samples.spearIdle = sample();
    out.samples.spearThrust = await holdPose('thrust', 0.52);
    p.attackT = 0;
    await waitFrames(20);

    // back to sword for the shots
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    await waitFrames(8);

    // 9. plunge flip check
    out.samples.plunge = await holdPose('plunge', 0.5);
    p.attackT = 0;
    await waitFrames(25);

    // ---- 10. camera shots (right-side profile: camera at -X looking +X) ----
    g.rig.freeCam = true;
    g.rig.freePos.set(p.position.x - 3.2, p.position.y + 1.5, p.position.z + 0.2);
    g.rig.yaw = Math.PI / 2;   // look +X toward him
    g.rig.pitch = -0.07;
    await waitFrames(6);
    await window.saveShot('v24_idle_grip');
    await holdPose('light1', 0.32, 4);
    await window.saveShot('v24_windup');
    await holdPose('light1', 0.56, 4);
    await window.saveShot('v24_strike');
    await holdPose('thrust', 0.52, 4);
    await window.saveShot('v24_thrust');
    p.attackT = 0; p.attackDur = 0.6;
    await waitFrames(10);
    return out;
  }).catch((e) => ({ err: String(e) }));

  check('f24verify', r);
  fs.writeFileSync('/home/z/my-project/scripts/f24_verify.json', JSON.stringify(report, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
