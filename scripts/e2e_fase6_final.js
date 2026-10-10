// E2E FINAL Fase 6 — menú épico, caballero, prado de briznas, mar épico
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  const g = window.__kotfsGame;
  if (!g) { window.__kotfsE2ELog = ['FAIL — juego no inicializado']; return 'abort'; }
  window.__kotfsE2ELog = log;
  g.input.requestLock = () => {};

  // ---- 1. Caballero ----
  const pRoot = g.player.model.root;
  pRoot.updateMatrixWorld(true);
  const skinnedMeshes = [];
  pRoot.traverse((o) => { if (o.isSkinnedMesh) skinnedMeshes.push(o); });
  for (const m of skinnedMeshes) {
    const own = m.skeleton.bones.filter((b) => pRoot.getObjectByName(b.name) === b).length;
    check(`${m.name} esqueleto propio`, own === m.skeleton.bones.length, `${own}/${m.skeleton.bones.length}`);
    m.computeBoundingBox();
    const bb = m.boundingBox;
    const ratio = (bb.max.y - bb.min.y) / Math.max(0.01, bb.max.x - bb.min.x);
    check(`${m.name} sin estiramiento`, ratio < 3.2, `ratio=${ratio.toFixed(2)}`);
  }
  check('Modelo = KnightModelGLB', g.player.model.constructor.name === 'KnightModelGLB');

  // ---- 2. Prado ----
  const veg = g.world.vegetation.stats;
  check('Prado de briznas activo (>30k)', veg.blades > 30000, `${veg.blades} briznas`);
  // briznas cerca del jugador: contar matrices no-cero del mesh
  let grassMesh = null;
  g.engine.scene.traverse((o) => { if (o.name === 'grass_field') grassMesh = o; });
  check('InstancedMesh grass_field en escena', !!grassMesh);
  if (grassMesh) {
    check('Geometría de brizna fina (9 verts, 8 tris)', grassMesh.geometry.attributes.position.count === 9,
      `${grassMesh.geometry.attributes.position.count} verts`);
    // aBlade per-instance attribute
    check('Atributo aBlade (curva/fase por brizna)', !!grassMesh.geometry.attributes.aBlade);
    check('Sin sombras proyectadas por brizna (perf)', grassMesh.castShadow === false);
    check('Recibe sombras de árboles/edificios', grassMesh.receiveShadow === true);
  }

  // ---- 3. Mar épico ----
  const w = g.world.water;
  let minH = 1e9, maxH = -1e9;
  for (let i = 0; i < 120; i++) {
    const x = 575 + Math.sin(i * 2.4) * 100, z = 474 + Math.cos(i * 1.7) * 100;
    const h = w.waveHeightAt(x, z);
    if (h < minH) minH = h; if (h > maxH) maxH = h;
  }
  const openSea = maxH - minH;
  check('Oleaje épico en mar abierto (>1.8m)', openSea > 1.8, `${openSea.toFixed(2)}m`);
  const dockH = [];
  for (let i = 0; i < 40; i++) dockH.push(w.waveHeightAt(21 + Math.sin(i) * 6, 250 + Math.cos(i) * 6));
  const dockAmp = Math.max(...dockH) - Math.min(...dockH);
  check('Puerto en calma (<0.6m)', dockAmp < 0.6, `${dockAmp.toFixed(2)}m`);
  check('Malla 384×384', w.mesh.geometry.parameters.widthSegments === 384, `${w.mesh.geometry.parameters.widthSegments}`);

  // ---- 4. Sin salto automático (regresión) ----
  const p0 = g.player.position.clone();
  await wait(1500);
  const p1 = g.player.position.clone();
  const dy = Math.abs(p1.y - p0.y);
  check('Sin salto automático (regresión)', dy < 0.35, `dy=${dy.toFixed(3)}`);

  // ---- 5. FPS razonable con prado ----
  let frames = 0;
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(); };
    requestAnimationFrame(tick);
  });
  const fps = frames / 2;
  log.push(`INFO — FPS con prado de ${veg.blades} briznas: ${fps.toFixed(0)}`);

  window.__kotfsE2ELog = log;
  return log.join('\n');
})().catch((e) => { window.__kotfsE2ELog = ['ERROR: ' + (e && e.message)]; return 'error'; });
