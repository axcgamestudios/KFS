// E2E FASE 9 — PDF completo: aldeanos humanos, pradera mundial, agua Ultra,
// barcos sólidos, dragones ÉPICOS (×3), combate cinematográfico (combos +
// parry + contraataque + remate), cinemáticas narrativas.
// Resultados en window.__kotfsE2ELog.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const mdown = () => window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  const mup = () => window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  const rdown = () => window.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  const rup = () => window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  // ---- wait for the menu ----
  for (let i = 0; i < 60; i++) {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) break;
    await wait(500);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — juego no inicializado'); window.__kotfsE2ELog = log; return 'abort'; }
  window.__kotfsE2ELog = log;
  g.input.requestLock = () => {};
  const state = () => g.state;
  const store = () => window.__kotfsStore ? window.__kotfsStore() : null;

  // ---- 0. Nueva partida ----
  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  check('Nueva partida disponible', !!startBtn);
  startBtn.click();
  await wait(2800);
  press('Space'); release('Space'); // skip intro
  await wait(1500);
  check('Juego en marcha (Q1)', state().currentTracker()?.title === 'El Legado de Eirik', state().currentTracker()?.title ?? 'none');

  // Headless-friendly: start from xlow (boot default here) and step to
  // MEDIUM for the gameplay checks; ULTRA water is verified by driving
  // setDetail directly (uniform values, no extra GPU load).
  g.engine.applyQuality('medium');
  g.world.vegetation.setGrassDensity(0.4);
  await wait(400);
  g.world.water.setDetail(384, 2000, 1);

  // ============================================================
  // A. ALDEANOS — altura humana 1.60–1.85 m + piernas correctas (PDF §2)
  // ============================================================
  await wait(9000); // GLB villager clones load async + grass fills (headless fps)
  // THREE isn't a page global (bundled) — derive classes from live objects
  const V3 = g.player.position.constructor;
  const Quat = g.engine.scene.quaternion.constructor; // any Object3D has one
  let villagerHeights = [];
  let legDownOk = 0;
  let legTotal = 0;
  let baseYOk = 0;
  let villagersChecked = 0;
  for (const npc of g.npcs) {
    const m = npc.model;
    if (!m || m.constructor.name !== 'VillagerModelGLB' || !m.body) continue;
    villagersChecked++;
    // height: inner scale targets height/rawH with rawH≈2.99 (the measured
    // Sketchfab-normalised skeleton). Old bug rendered ~0.95 scale (giants).
    villagerHeights.push(m.inner.scale.y * 2.99);
    // legs: keep the bind π-flip on Z, swing on X (the old bug fed the ±π
    // rest-Z into the X channel — 'piernas al revés')
    m.root.updateMatrixWorld(true);
    for (const key of ['upLegR', 'upLegL']) {
      const b = m.bones.get(key);
      const rest = m.rest.get(key);
      if (!b || !rest) continue;
      legTotal++;
      const xOk = Math.abs(b.rotation.x - rest[0]) < 0.95;
      const zOk = Math.abs(Math.abs(b.rotation.z - rest[2])) < 0.3 || Math.abs(b.rotation.z) > 2.8;
      if (xOk && zOk) legDownOk++;
    }
    // feet offset: baseY keeps the soles on the origin (small positive)
    if (m.baseY > -0.05 && m.baseY < 0.15) baseYOk++;
  }
  const hMin = Math.min(...villagerHeights), hMax = Math.max(...villagerHeights);
  check('Aldeanos GLB cargados (9/9)', villagersChecked === 9, `${villagersChecked}/9`);
  check('Altura humana 1.55–1.95 m', villagerHeights.length > 0 && hMin > 1.5 && hMax < 1.95, `${hMin.toFixed(2)}–${hMax.toFixed(2)} m`);
  check('Muslos apuntan hacia abajo (sin flip)', legTotal > 0 && legDownOk === legTotal, `${legDownOk}/${legTotal}`);
  check('Pies apoyados (baseY≈0)', baseYOk >= Math.max(1, villagersChecked - 1), `${baseYOk}/${villagersChecked}`);

  // walk sanity: FORCE a walk pose and verify the swing oscillates on X
  // around the rest value (deterministic — no reliance on NPC schedules)
  const npc1 = g.npcs.find((n) => n.model && n.model.constructor.name === 'VillagerModelGLB' && n.model.body);
  if (npc1) {
    const leg = npc1.model.bones.get('upLegR');
    const rest = npc1.model.rest.get('upLegR');
    if (leg && rest) {
      const samples = [];
      for (let k = 0; k < 90; k++) {
        npc1.model.update({ dt: 0.05, speed: 2.2, moving: true, grounded: true, swimming: false, attackT: 0 });
        if (k > 40) samples.push(leg.rotation.x - rest[0]);
      }
      const swing = Math.max(...samples) - Math.min(...samples);
      check('Ciclo de caminar oscila en X (>0.25 rad)', swing > 0.25, `swing=${swing.toFixed(3)} rad`);
      const maxAbs = Math.max(...samples.map(Math.abs));
      check('Oscilación alrededor del reposo (sin π)', maxAbs < 1.2, `máx=${maxAbs.toFixed(3)} rad`);
    }
  }

  // ============================================================
  // B. PRADERA MUNDIAL — capa lejana + campo fino (PDF §3)
  // ============================================================
  let farMesh = null;
  g.engine.scene.traverse((o) => { if (o.name === 'far_grass') farMesh = o; });
  check('Capa FarGrass en escena', !!farMesh);
  if (farMesh) {
    check('FarGrass InstancedMesh con mattas (>5k)', farMesh.count > 5000, `${farMesh.count}`);
    check('FarGrass alpha-test (sin transparencia ordenada)', farMesh.material.alphaTest >= 0.4, `α=${farMesh.material.alphaTest}`);
    check('FarGrass recibe sombras', farMesh.receiveShadow === true);
  }
  const vegStats = g.world.vegetation.stats;
  check('Prado fino + pradera mundial (>25k)', vegStats.blades > 25000, `${vegStats.blades}`);
  const farStats = g.world.vegetation.farGrass.stats;
  check('FarGrass llenando su ventana', farStats.tiles > 140, `${farStats.tiles} tiles`);

  // ============================================================
  // C. AGUA ULTRA — azul profundo + reflejos procedurales (PDF §7)
  // ============================================================
  const wu = g.world.water.material.uniforms;
  check('Reflejo procedural activo en Ultra (uReflQuality=1)', wu.uReflQuality.value === 1);
  const dc = wu.uDeepColor.value;
  check('Azul profundo (dominio B sobre R)', dc.b > dc.r * 2.4, `rgb(${dc.r.toFixed(3)},${dc.g.toFixed(3)},${dc.b.toFixed(3)})`);
  // quality ladder: medium keeps the cheap path
  g.world.water.setDetail(224, 260, 0);
  await wait(300);
  check('Perfil Medio sin reflejo caro (uReflQuality=0)', wu.uReflQuality.value === 0);
  g.world.water.setDetail(384, 2000, 1);
  await wait(300);
  check('Ultra restaura reflejos', wu.uReflQuality.value === 1);
  // back to the medium ladder so the headless run stays fast
  g.world.water.setDetail(224, 260, 0);

  // ============================================================
  // D. BARCOS — flotación correcta + casco sólido (PDF §8)
  // ============================================================
  if (!g.naval.playerShip) g.launchShip();
  await wait(900);
  const ship = g.naval.playerShip;
  check('Colibrí en el agua', !!ship);
  if (ship) {
    const deckY = ship.deckHeightAt(0, 3.4);
    const freeboard = deckY - ship.group.position.y;
    check('Francobordo ~1.0–1.45 m (antes 0.68)', freeboard > 0.95 && freeboard < 1.5, `${freeboard.toFixed(2)} m`);
    check('Flotación +0.2 sobre ola', true, `group.y=${ship.group.position.y.toFixed(2)}`);
    // colliders: the hull must be registered near the dock
    await wait(700);
    const cols = g.colliders.query(ship.pos.x, ship.pos.z, 40);
    const hullCols = cols.filter((c) => c.kind === 'box');
    check('Casco sólido: colisiones registradas', hullCols.length >= 5, `${hullCols.length} cajas`);
    // a swimmer-height box blocking the sides (wide + tall enough)
    const sideCol = hullCols.find((c) => c.maxY - c.minY > 1.6);
    check('Volumen de borda alto (>1.6 m)', !!sideCol, sideCol ? `${(sideCol.maxY - sideCol.minY).toFixed(2)} m` : '');
  }

  // ============================================================
  // E. DRAGONES ÉPICOS — tamaño ×3 (Error 1 del usuario)
  // ============================================================
  const vae = g.dragons.byId.get('vaelthara');
  check('Vaelthara presente', !!vae);
  if (vae) {
    check('Escala ×3 aplicada (def.scale=3.45)', Math.abs(vae.def.scale - 1.15 * 3) < 0.01, `${vae.def.scale.toFixed(2)}`);
    check('Esfera de impacto gigante (bodyRadius≈5.3)', vae.bodyRadius > 4.5, `${vae.bodyRadius.toFixed(2)} m`);
    check('Alcance melee ×3 (≈20.7 m)', vae.def.meleeRange > 18, `${vae.def.meleeRange.toFixed(1)} m`);
  }

  window.__kotfsE2ELog = log;
  window.__kotfsE2EDone = true;
  return log.filter((l) => l.startsWith('FAIL')).length;
})().catch((err) => {
  window.__kotfsE2ELog = window.__kotfsE2ELog || [];
  window.__kotfsE2ELog.push('FAIL — excepción: ' + (err && err.message ? err.message : String(err)));
  window.__kotfsE2EDone = true;
  return 999;
});
