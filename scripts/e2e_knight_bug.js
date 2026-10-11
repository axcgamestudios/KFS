// E2E — Reproducción del bug del caballero estirado (sin THREE global)
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

  const player = g.player;
  log.push('model class: ' + player.model.constructor.name);
  const pRoot = player.model.root;

  // ---- 1. ¿El esqueleto del mesh usa los huesos del CLON o los ORIGINALES? ----
  pRoot.updateMatrixWorld(true);
  const skinnedMeshes = [];
  pRoot.traverse((o) => { if (o.isSkinnedMesh) skinnedMeshes.push(o); });
  for (const m of skinnedMeshes) {
    const skBones = m.skeleton.bones;
    let shared = 0, own = 0;
    for (const b of skBones) {
      const inClone = pRoot.getObjectByName(b.name);
      if (inClone === b) own++; else shared++;
    }
    check(`${m.name}: esqueleto con huesos propios`, own === skBones.length, `propios=${own} compartidos=${shared}/${skBones.length}`);
  }

  // ---- 2. bbox SKINNED real (computeBoundingBox aplica huesos) ----
  for (const m of skinnedMeshes) {
    try {
      m.computeBoundingBox();
      const bb = m.boundingBox;
      const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, d = bb.max.z - bb.min.z;
      log.push(`  ${m.name} bbox skinned(local): ${w.toFixed(2)} × ${h.toFixed(2)} × ${d.toFixed(2)} min=(${bb.min.x.toFixed(2)},${bb.min.y.toFixed(2)},${bb.min.z.toFixed(2)})`);
      check(`${m.name} sin estiramiento vertical (alto/ancho<3.2)`, h / Math.max(0.01, w) < 3.2, `ratio=${(h / Math.max(0.01, w)).toFixed(2)}`);
    } catch (e) { log.push(`  bbox error: ${e.message}`); }
  }

  // ---- 3. Rotaciones NaN / escalas raras ----
  let nanBones = 0, weirdScale = 0;
  pRoot.traverse((o) => {
    const r = o.rotation;
    if (Number.isNaN(r.x) || Number.isNaN(r.y) || Number.isNaN(r.z)) nanBones++;
    const s = o.scale;
    if (Math.abs(s.x - 1) > 0.05 || Math.abs(s.y - 1) > 0.05 || Math.abs(s.z - 1) > 0.05) weirdScale++;
  });
  check('Sin rotaciones NaN', nanBones === 0, `nan=${nanBones}`);
  check('Sin escalas raras', weirdScale === 0, `escalas=${weirdScale}`);
  if (weirdScale > 0) {
    pRoot.traverse((o) => {
      const s = o.scale;
      if (Math.abs(s.x - 1) > 0.05 || Math.abs(s.y - 1) > 0.05 || Math.abs(s.z - 1) > 0.05)
        log.push(`    escala rara: ${o.name} = (${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)})`);
    });
  }

  // ---- 4. La malla responde a los huesos animados ----
  const mesh0 = skinnedMeshes[0];
  const skBone = mesh0.skeleton.bones.find((b) => b.name === 'j_hipR');
  const cloneBone = pRoot.getObjectByName('j_hipR');
  if (skBone && cloneBone && cloneBone !== skBone) {
    const before = skBone.matrixWorld.clone();
    cloneBone.rotation.x += 0.6;
    pRoot.updateMatrixWorld(true);
    const moved = !skBone.matrixWorld.equals(before);
    check('La malla sigue los huesos del clon', moved, moved ? 'OK' : '⚠️ skeleton ORIGINAL compartido — la malla NO anima');
    cloneBone.rotation.x -= 0.6;
    pRoot.updateMatrixWorld(true);
  } else if (skBone === cloneBone) {
    log.push('  skeleton.bones == huesos del clon (correcto)');
  }

  // ---- 5. Altura del mundo del caballero ----
  try {
    mesh0.computeBoundingSphere();
    const sp = mesh0.boundingSphere;
    const wp = mesh0.getWorldPosition ? null : null;
    const mw = mesh0.matrixWorld.elements;
    const c = sp.center;
    const wx = mw[0] * c.x + mw[4] * c.y + mw[8] * c.z + mw[12];
    const wy = mw[1] * c.x + mw[5] * c.y + mw[9] * c.z + mw[13];
    const wz = mw[2] * c.x + mw[6] * c.y + mw[10] * c.z + mw[14];
    log.push(`  centro mundial: (${wx.toFixed(2)}, ${wy.toFixed(2)}, ${wz.toFixed(2)}) radio=${sp.radius.toFixed(2)}`);
  } catch (e) { log.push('  sphere err: ' + e.message); }

  // ---- 6. Cámara al frente para captura ----
  const pp = window.__kotfsPlayer || { x: 0, y: 0, z: 0 };
  const cam = g.engine.camera;
  cam.position.set(pp.x + 2.2, pp.y + 1.5, pp.z + 2.6);
  cam.lookAt(pp.x, pp.y + 1.0, pp.z);
  await wait(400);
  log.push(`player en (${pp.x.toFixed(1)}, ${pp.y.toFixed(1)}, ${pp.z.toFixed(1)})`);
  log.push('LISTO_PARA_CAPTURA');
  window.__kotfsE2ELog = log;
  return log.join('\n');
})().catch((e) => { window.__kotfsE2ELog = ['ERROR: ' + (e && e.message)]; return 'error'; });
