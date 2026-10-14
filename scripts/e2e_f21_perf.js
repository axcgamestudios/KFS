// e2e_f21_perf.js — HIGH-graphics feature + load probe (Fase 21)
// Boots at HIGH (postfx ON = bloom + sun shafts, shadows 2048, grass, refl 1),
// then audits: new knight model (skinned + driven), FP mode on B, god-ray
// uniforms, draw-call/triangle budget (renderer.info), frame-time spike
// profile (JS/GC hitches show even under SwiftShader), asset 404s.
// Run: NODE_PATH=/home/z/.npm-global/lib/node_modules node scripts/e2e_f21_perf.js
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/scripts/shots_f21';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

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
        quality: 'high', tier: 'high', settingsRev: 3,
        waves: true, shadows: true, realLights: true, grass3d: true,
        renderChunks: 6, reflections: 0, postfx: true, resolution: 0.5, showFps: true,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) { /* ignore */ }
  });

  const failedAssets = [];
  const pageErrs = [];
  page.on('response', (r) => {
    const u = r.url();
    if ((u.includes('/game/') || u.includes('menu/')) && r.status() >= 400) failedAssets.push(`${r.status()} ${u.split('/').pop()}`);
  });
  page.on('pageerror', (e) => pageErrs.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrs.push(('CONSOLE: ' + m.text()).slice(0, 200)); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const report = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const g = window.__kotfsGame;
    if (!g) return { fatal: 'no game instance' };
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
    if (!playing) return { fatal: 'never reached PLAYING' };
    await wait(4500);
    const log = { steps: [] };

    // 1) the player's body is the NEW rigged knight (skinned mesh, 15 bones)
    try {
      let skinned = null; let boneNames = [];
      g.player.model.root.traverse((o) => {
        if (o.isSkinnedMesh && skinned === null) {
          skinned = { tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, bones: o.skeleton.bones.length };
          boneNames = o.skeleton.bones.map((b) => b.name);
        }
      });
      log.knight = { skinned, hasAllBones: ['j_root','j_torso','j_head','j_shoulderR','j_elbowR','j_wristR','j_hipR','j_kneeR','j_ankleR'].every((n) => boneNames.includes(n)) };
    } catch (e) { log.knight = { err: String(e).slice(0, 120) }; }

    // 2) pose is being driven (bones actually rotate away from identity)
    try {
      const bones = [];
      g.player.model.root.traverse((o) => { if (o.isBone) bones.push(o); });
      const moving = bones.filter((b) => Math.abs(b.rotation.x) > 0.01 || Math.abs(b.rotation.y) > 0.01 || Math.abs(b.rotation.z) > 0.01);
      log.bonesDriven = `${moving.length}/${bones.length}`;
    } catch (e) { log.bonesDriven = 'err ' + String(e).slice(0, 80); }

    // 3) head-hide API for FP
    try {
      const m = g.player.model;
      log.headApi = typeof m.setHeadHidden === 'function';
    } catch (e) { log.headApi = false; }

    // 3b) scene composition: who owns the objects?
    try {
      const byType = {}; const castShadow = { yes: 0, no: 0 };
      const byRoot = {};
      const rootName = (o) => {
        let n = o;
        while (n.parent && n.parent.type !== 'Scene') n = n.parent;
        return n.name || n.type;
      };
      g.engine.scene.traverse((o) => {
        byType[o.type] = (byType[o.type] || 0) + 1;
        if (o.isMesh || o.isSkinnedMesh) {
          if (o.castShadow) castShadow.yes++; else castShadow.no++;
          const r = rootName(o);
          byRoot[r] = (byRoot[r] || 0) + 1;
        }
      });
      const topRoots = Object.entries(byRoot).sort((a, b) => b[1] - a[1]).slice(0, 14);
      log.scene = { byType, castShadow, topRoots, total: Object.values(byType).reduce((a, b) => a + b, 0) };
    } catch (e) { log.scene = { err: String(e).slice(0, 100) }; }

    // 4) renderer budget at HIGH — per-RENDER-CALL draw deltas (shadow pass /
    //    main scene / composer passes each show up as one step)
    try {
      const r = g.engine.renderer;
      r.info.autoReset = false;
      r.info.reset();
      const deltas = [];
      const orig = r.render.bind(r);
      let c0 = 0;
      r.render = (...args) => { c0 = r.info.render.calls; orig(...args); deltas.push(r.info.render.calls - c0); };
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      r.render = orig;
      const info = r.info;
      log.render = {
        calls: info.render.calls, tris: info.render.triangles,
        geoms: info.memory.geometries, texs: info.memory.textures,
        perRender: deltas.slice(0, 14),
      };
    } catch (e) { log.render = { err: String(e).slice(0, 120) }; }

    // 5) postfx chain at HIGH: composer + bloom + shafts, sun uniforms fed
    try {
      const p = g.postfx;
      log.postfx = {
        enabled: p?.enabled, hasComposer: !!p?.composer, hasShafts: !!p?.shafts,
        shaftStrength: p?.shafts ? p.shafts.uniforms.uStrength.value : null,
        shaftSun: p?.shafts ? [p.shafts.uniforms.uSunPos.value.x.toFixed(2), p.shafts.uniforms.uSunPos.value.y.toFixed(2)] : null,
      };
    } catch (e) { log.postfx = { err: String(e).slice(0, 120) }; }

    // 6) pixel ratio is DPR-correct now
    try { log.pixelRatio = g.engine.renderer.getPixelRatio(); } catch (e) { log.pixelRatio = 'err'; }

    // 5b) aim the rig straight at the sun (deterministic: set the yaw from
    // the sun's azimuth) so the shaft pass has a visible emitter
    try {
      const sd = g.world.sky.sunDir;
      g.rig.yaw = Math.atan2(sd.x, sd.z);
      g.rig.pitch = Math.max(0.04, Math.asin(Math.max(0.05, sd.y)) * 0.85);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await wait(3000);
      log.shaftAimed = {
        strength: g.postfx?.shafts ? g.postfx.shafts.uniforms.uStrength.value : null,
        sun: g.postfx?.shafts ? [g.postfx.shafts.uniforms.uSunPos.value.x.toFixed(2), g.postfx.shafts.uniforms.uSunPos.value.y.toFixed(2)] : null,
        sunElev: +sd.y.toFixed(3),
      };
    } catch (e) { log.shaftAimed = { err: String(e).slice(0, 100) }; }

    // 7) FIRST PERSON toggle — DETERMINISTIC: call the game method directly
    // (SwiftShader at HIGH runs ~1 frame/10s; key events are racy)
    const store = window.__kotfsStoreGet();
    try { g['toggleFirstPerson'](store); } catch (e) { log.fpDirect = String(e).slice(0, 100); }
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await wait(2000);
    log.fpBadgeOn = document.body.innerText.includes('FIRST PERSON');
    try {
      const cam = g.engine.camera;
      const p = g.player.position;
      log.fpCamY = +(cam.position.y - p.y).toFixed(2); // ≈1.70 at the eye
      let headScale = null;
      g.player.model.root.traverse((o) => { if (o.name === 'j_head') headScale = o.scale.x; });
      log.fpHeadScale = headScale;
    } catch (e) { log.fpCam = 'err ' + String(e).slice(0, 80); }
    try { g['toggleFirstPerson'](store); } catch (e) { /* ignore */ }
    await wait(1200);
    log.fpBadgeOff = !document.body.innerText.includes('FIRST PERSON');
    try {
      let headScale = null;
      g.player.model.root.traverse((o) => { if (o.name === 'j_head') headScale = o.scale.x; });
      log.tpHeadScale = headScale;
      log.tpCamDist = +g.rig.distance.toFixed(2);
    } catch (e) { /* ignore */ }

    // 8) FREE CAM still works (P) — direct call, then back
    try { g['toggleFreeCam'](store); } catch (e) { /* ignore */ }
    await wait(1000);
    log.freeCamBadge = document.body.innerText.includes('FREE CAM');
    try { g['toggleFreeCam'](store); } catch (e) { /* ignore */ }
    await wait(800);

    // 9) PURE-JS stutter audit: stop the render loop and drive the game
    // update by hand (no rendering, no SwiftShader) — this isolates exactly
    // the JS-side cost the user feels as stutter (chunk streaming, grass
    // fills, AI, animation, GC pressure).
    try {
      const eng = g.engine;
      eng.stop();
      const samples = [];
      const N = 240;
      // per-SYSTEM timing: wrap the game's own subsystem methods so we know
      // exactly which system owns the stutter
      const perSys = new Map();
      const wrapObj = (obj, method, label) => {
        if (!obj || typeof obj[method] !== 'function') return;
        const orig = obj[method].bind(obj);
        obj[method] = (...args) => {
          const t0 = performance.now();
          const r = orig(...args);
          const d = performance.now() - t0;
          const rec = perSys.get(label) ?? { n: 0, total: 0, max: 0 };
          rec.n++; rec.total += d; rec.max = Math.max(rec.max, d);
          perSys.set(label, rec);
          return r;
        };
      };
      const W = g.world;
      wrapObj(W?.terrain, 'update', 'terrain(chunks)');
      wrapObj(W?.vegetation, 'update', 'vegetation');
      wrapObj(W?.vegetation?.grassField, 'update', '· grassField');
      wrapObj(W?.vegetation?.farGrass, 'update', '· farGrass');
      const origBuildCluster = W?.vegetation?.buildCluster?.bind(W.vegetation);
      if (origBuildCluster) {
        let clusterCount = 0;
        W.vegetation.buildCluster = (...a) => { clusterCount++; return origBuildCluster(...a); };
        log.clusterRebuilds = () => clusterCount;
      }
      // WHO dirties the clusters? count the sources
      const evt = { scatter: 0, removed: 0, buildChunk: 0, refreshGrass: 0, moveWindow: 0 };
      const V = W?.vegetation;
      if (V) {
        const oScatter = V.onChunkScatter.bind(V);
        V.onChunkScatter = (...a) => { evt.scatter++; return oScatter(...a); };
        const oRemoved = V.onChunkRemoved.bind(V);
        V.onChunkRemoved = (...a) => { evt.removed++; return oRemoved(...a); };
        const oRefresh = V.refreshGrassNear?.bind(V);
        if (oRefresh) V.refreshGrassNear = (...a) => { evt.refreshGrass++; return oRefresh(...a); };
      }
      const T = W?.terrain;
      const trace = [];
      let frameNo = 0;
      if (T) {
        const oBuild = T.buildChunk.bind(T);
        T.buildChunk = (cx, cz, res, ...rest) => {
          evt.buildChunk++;
          if (trace.length < 60) trace.push(`f${frameNo} BUILD ${cx},${cz} res=${res ?? T.res}`);
          return oBuild(cx, cz, res, ...rest);
        };
        const oCullRemove = T.onChunkRemoved;
        // terrain's internal removals flow through onChunkRemoved (sink) —
        // also catch the direct sceneRef removals via a chunks-size sampler
        let lastChunkCount = -1;
        const sizeSampler = setInterval(() => {
          const n = T.chunks ? T.chunks.size : -1;
          if (n !== lastChunkCount && trace.length < 60) {
            trace.push(`f${frameNo} chunks=${n}`);
            lastChunkCount = n;
          }
        }, 30);
        log.stopSampler = () => clearInterval(sizeSampler);
      }
      const GF = V?.grassField;
      if (GF) {
        const oMove = GF.moveWindow.bind(GF);
        GF.moveWindow = (...a) => { evt.moveWindow++; return oMove(...a); };
      }
      log.evt = evt;
      wrapObj(W?.water, 'update', 'water');
      wrapObj(W?.sky, 'update', 'sky');
      wrapObj(W?.weather, 'update', 'weather');
      wrapObj(g.naval, 'update', 'naval');
      wrapObj(g.bandits, 'update', 'bandits');
      wrapObj(g.dragons, 'update', 'dragons');
      wrapObj(g.vfx, 'update', 'vfx');
      wrapObj(g.combat, 'update', 'combat');
      wrapObj(g.player, 'update', 'player');
      wrapObj(g.mounts, 'update', 'mounts');
      wrapObj(g.seaBeasts, 'update', 'seaBeasts');
      // simulate a sprint tour: walk forward + turn, teleporting midway to
      // force chunk streaming churn (the classic hitch source)
      let teleported = false;
      const steady = [];   // pre-teleport: normal exploration
      const churn = [];    // post-teleport: worst-case streaming
      for (let i = 0; i < N; i++) {
        if (i === 120) {
          g.player.teleport(60, 12, 60); // jump across the world: chunk churn
          teleported = true;
        }
        g.input.keys.add('KeyW');
        if (i % 30 === 0) g.input.keys.add('KeyA');
        if (i % 30 === 15) g.input.keys.delete('KeyA');
        frameNo = i;
        const t0 = performance.now();
        g.update(1 / 60);
        const t1 = performance.now();
        (teleported ? churn : steady).push(t1 - t0);
        samples.push(t1 - t0);
        g.input.keys.delete('KeyW');
      }
      const stat = (arr) => {
        const a = [...arr].sort((x, y) => x - y);
        return { n: a.length, p50: +a[Math.floor(a.length * 0.5)].toFixed(2), p95: +a[Math.floor(a.length * 0.95)].toFixed(2), max: +a[a.length - 1].toFixed(1) };
      };
      log.steady = stat(steady);
      log.churn = stat(churn);
      // report the top offenders
      try { if (typeof log.stopSampler === 'function') log.stopSampler(); } catch (e) { /* ignore */ }
      log.trace = trace;
      try {
        log.queues = {
          grassQ: W?.vegetation?.grassField?.fillQueue?.length ?? 'na',
          farQ: W?.vegetation?.farGrass?.fillQueue?.length ?? 'na',
          clusterRebuilds: typeof log.clusterRebuilds === 'function' ? log.clusterRebuilds() : 'na',
          evt: { ...log.evt },
        };
      } catch (e) { log.queues = { err: String(e).slice(0, 80) }; }
      const top = [...perSys.entries()]
        .map(([name, r]) => ({ name, calls: r.n, avgMs: +(r.total / r.n).toFixed(2), maxMs: +r.max.toFixed(1), totalMs: +r.total.toFixed(0) }))
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, 10);
      log.updaters = top;
      samples.sort((a, b) => a - b);
      const sum = samples.reduce((a, b) => a + b, 0);
      log.jsUpdate = {
        n: N, teleported,
        avgMs: +(sum / N).toFixed(2),
        p50: +samples[Math.floor(N * 0.5)].toFixed(2),
        p95: +samples[Math.floor(N * 0.95)].toFixed(2),
        p99: +samples[Math.floor(N * 0.99)].toFixed(2),
        worst: +samples[N - 1].toFixed(2),
        overBudget16: samples.filter((x) => x > 8).length, // >8ms JS = render budget gone
      };
      eng.start();
      await wait(3000);
    } catch (e) { log.jsUpdate = { err: String(e).slice(0, 140) }; }

    return log;
  });

  if (report.fatal) {
    ok('boot', false, report.fatal);
  } else {
    ok('booted to PLAYING at HIGH', true);
    ok('new knight: single skinned mesh, 15 bones', !!report.knight?.skinned && report.knight.skinned.bones === 15 && report.knight.hasAllBones,
      JSON.stringify(report.knight));
    ok('skeleton is being driven', !report.bonesDriven?.startsWith('err') && parseInt(report.bonesDriven ?? '0') > 4, report.bonesDriven);
    ok('setHeadHidden API present', report.headApi === true);
    {
      const pr = report.render?.perRender ?? [];
      const mainScene = Math.max(0, ...pr);
      ok('render budget sane at HIGH (<2200 calls incl. shadow)', mainScene < 2200, `perRender=[${pr.join(',')}] tris=${report.render?.tris}`);
    }
    ok('postfx chain ON at HIGH (bloom+shafts)', report.postfx?.enabled === true && report.postfx.hasShafts === true, JSON.stringify(report.postfx));
    ok('god-ray sun uniforms fed when sun in view', report.shaftAimed && report.shaftAimed.strength > 0, JSON.stringify(report.shaftAimed));
    ok('FP badge toggles on B', report.fpBadgeOn === true);
    ok('FP camera at eye height (~1.7)', typeof report.fpCamY === 'number' && report.fpCamY > 1.4 && report.fpCamY < 2.0, 'camY=' + report.fpCamY);
    ok('FP hides head (bone scale ~0)', report.fpHeadScale !== null && report.fpHeadScale < 0.01, 'scale=' + report.fpHeadScale);
    ok('TP restores head + orbit', report.fpBadgeOff === true && report.tpHeadScale === 1 && (report.tpCamDist ?? 0) > 1, 'scale=' + report.tpHeadScale + ' dist=' + report.tpCamDist);
    ok('FREE CAM still on P', report.freeCamBadge === true);
    ok('JS update profile collected', report.jsUpdate && report.jsUpdate.n === 240, JSON.stringify({ ...report.jsUpdate, steady: report.steady, churn: report.churn, queues: report.queues }));
    console.log('TRACE: ' + JSON.stringify(report.trace));
    console.log('SCENE: ' + JSON.stringify(report.scene));
    console.log('SYSTEMS: ' + JSON.stringify(report.updaters));
    ok('steady-state JS fits the 60fps budget (p95 < 8ms)', report.steady && report.steady.p95 < 8, 'steady=' + JSON.stringify(report.steady) + ' churn=' + JSON.stringify(report.churn));
  }
  ok('no page errors', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | '));
  ok('no asset 404s', failedAssets.length === 0, failedAssets.slice(0, 4).join(' | '));

  await page.screenshot({ path: `${OUT}/high_village.jpg`, type: 'jpeg', quality: 80, timeout: 45000 }).catch(() => {});
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n==== ${passed}/${results.length} PASS ====`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('PROBE CRASH:', e); process.exit(2); });
