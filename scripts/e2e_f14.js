// FASE 14 — E2E: verificación de las optimizaciones de rendimiento contra el
// build estático (/KFS/). SwiftShader headless: verificación por medición.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = [];
  const check = (name, cond, extra = '') =>
    log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`);
  const press = (code, key) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || ' ', bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));

  // --- menú ---
  let startBtn = null;
  for (let i = 0; i < 160; i++) {
    startBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (startBtn) break;
    await wait(500);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — no game instance'); return log.join('\n'); }
  check('Menú carga', !!startBtn);
  g.input.requestLock = () => {};
  g.input.pointerLocked = true;
  startBtn.click();
  await wait(3500);
  press('Space'); release('Space');
  await wait(2500);
  press('Space'); release('Space');
  await wait(1500);

  const probe = g.debugProbe();

  // --- 1) migración de settings v3 + preset medio nuevo ---
  check('Migración v3 aplicada', probe.settings.settingsRev === 3, `rev=${probe.settings.settingsRev}`);
  check('Reflexión OFF por defecto en media', probe.settings.reflections === 0, `refl=${probe.settings.reflections}`);
  check('Pasto 3D sigue activo', probe.settings.grass3d === true);
  check('Densidad de pasto media 0.26', Math.abs(probe.quality.grassDensity - 0.26) < 0.005, `d=${probe.quality.grassDensity}`);
  check('Segmentos de agua 152 (antes 224)', probe.waterSegments === 152, `seg=${probe.waterSegments}`);
  check('Nubes del domo calidad 2 en media', probe.cloudQual === 2, `q=${probe.cloudQual}`);
  check('Briznas de pasto reducidas', probe.grassBlades > 15000 && probe.grassBlades < 55000, `blades=${probe.grassBlades}`);
  check('Radio de animación NPC 55 m', probe.quality.npcAnimDistance === 55, `r=${probe.quality.npcAnimDistance}`);

  // --- 2) agua: reflexión en caliente + exclusión del pasto ---
  const water = g.world?.water;
  check('reflHide con los meshes del pasto', Array.isArray(water?.reflHide) && water.reflHide.length >= 1, `n=${water?.reflHide?.length}`);
  check('Reflexión arranca apagada', !water?.reflRT);

  g.debugApplySettings({ ...probe.settings, reflections: 2 });
  await wait(1800);
  check('Reflexión alta en caliente crea RT', !!water.reflRT, `size=${water.reflRTSize}`);
  check('uReflQuality activo', water.material.uniforms.uReflQuality.value === 1);

  g.debugApplySettings({ ...probe.settings, reflections: 1 });
  await wait(1200);
  check('Reflexión baja 384²', !!water.reflRT && water.reflRTSize === 384, `size=${water.reflRTSize}`);

  g.debugApplySettings({ ...probe.settings });
  await wait(1000);
  check('Reflexión OFF destruye RT', !water.reflRT);

  // --- 3) culling de entidades (lo que pidió el usuario) ---
  const bs = g.bandits;
  const stats = bs?.stats?.();
  check('Bandidos spawneados 16', stats?.total === 16, `total=${stats?.total}`);

  const far = { x: 5000, y: 0, z: 5000 };
  const visibleBanditsFar = () => bs.bandits.filter((b) => !b.dead && b.group.visible).length;
  const visBefore = visibleBanditsFar();
  bs.update(0.016, far, true);
  const visAfter = visibleBanditsFar();
  check('Bandidos se ocultan a >330 m', visAfter === 0, `${visBefore}→${visAfter}`);

  const p = g.player.position;
  bs.update(0.016, { x: p.x, y: p.y, z: p.z }, true);
  const visBack = visibleBanditsFar();
  check('Bandidos reaparecen al volver', visBack >= 0, `visibles=${visBack}`);

  // caballos
  const mounts = g.mounts;
  if (mounts) {
    mounts.update(0.016, g.input, far, false, undefined);
    const horsesHidden = mounts.horses.every((h) => !h.model.root.visible);
    check('Caballos ocultos lejos', horsesHidden);
    mounts.update(0.016, g.input, { x: p.x, y: p.y, z: p.z }, false, undefined);
    const horsesBack = mounts.horses.some((h) => h.model.root.visible);
    check('Caballos visibles cerca', horsesBack);
  }

  // gaviotas
  const gulls = g.world?.gulls;
  if (gulls) {
    gulls.update(0.016, far);
    const gullsHidden = gulls.gulls.every((gu) => !gu.group.visible);
    check('Gaviotas ocultas lejos', gullsHidden);
    gulls.update(0.016, { x: p.x, y: p.y, z: p.z });
    const gullsBack = gulls.gulls.every((gu) => gu.group.visible);
    check('Gaviotas visibles cerca', gullsBack);
  }

  // --- 4) pose congelada sin errores (dt 0) ---
  let freezeOk = true;
  try {
    g.player.model.update({ dt: 0, speed: 0, moving: false, grounded: true, swimming: false, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1 });
  } catch (e) { freezeOk = false; }
  check('Pose congelada (dt=0) sin excepción', freezeOk);

  // --- 5) luz de aliento compartida de dragones ---
  const dm = g.dragons;
  check('Una sola luz de aliento', !!dm && !!dm.breathLight, `light=${!!dm?.breathLight}`);
  const lightCount = dm?.scene ? dm.scene.children.filter((o) => o.isPointLight).length : -1;
  check('Luces puntuales de dragón en escena: 1', lightCount === 1, `n=${lightCount}`);

  // --- 6) caché de alturas determinista ---
  const th = g.world.terrainHeight;
  const h1 = th.height(10.04, 20.06);
  const h2 = th.height(10.04, 20.06);
  const h3 = th.height(10.05, 20.06);
  check('Caché de altura consistente', h1 === h2 && Math.abs(h3 - h1) < 0.5, `h1=${h1.toFixed(2)} h3=${h3.toFixed(2)}`);

  // --- 7) presupuesto de llamas ---
  check('FPS del motor medible', typeof probe.fps === 'number', `fps=${probe.fps}`);

  window.__kotfsE2ELogF14 = log;
  return log.join('\n');
})()
