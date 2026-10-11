// E2E FASE 10-A — arranque ligero: menú limpio, nueva partida, espada de
// inicio, texturas, aldeanos humanos. (xlow quality for SwiftShader)
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const mark = (s) => { window.__f10a = s; };
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  mark('menu-wait');
  for (let i = 0; i < 70; i++) {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) break;
    await wait(400);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — juego no inicializado'); window.__kotfsE2ELogA = log; mark('done'); return 'abort'; }
  g.input.requestLock = () => {};
  const state = () => g.state;

  // calidad mínima ANTES de empezar (SwiftShader)
  mark('quality-xlow');
  g.engine.applyQuality('xlow');
  g.world.water.setDetail(96, 60, 0);
  g.world.vegetation.setGrassDensity(0);
  await wait(400);

  const menuText = document.body.innerText;
  check('Menú sin texto de fase (FASE 6)', !menuText.includes('FASE 6'));
  check('Menú sin versión v0.x', !/v0\.\d/.test(menuText));

  mark('start');
  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  check('Nueva partida disponible', !!startBtn);
  startBtn.click();
  await wait(2500);
  mark('skip-intro');
  press('Space'); release('Space');
  await wait(1500);

  mark('checks-start');
  check('Juego en marcha (Q1 activa)', state().questStates.size > 0, `quests=${state().questStates.size}`);
  check('Espada de inicio en inventario', state().hasItem('espada_acero'));
  check('Espada de inicio EQUIPADA', state().equippedWeapon === 'espada_acero', state().equippedWeapon ?? 'none');
  const kv = g.player.model;
  const isKnightGLB = kv?.constructor?.name === 'KnightModelGLB';
  check('Jugador = KnightModelGLB (GLB restaurado)', isKnightGLB, kv?.constructor?.name ?? 'fallback');
  check('Arma en la mano (kit restaurado)', isKnightGLB && !!kv.activeWeapon);
  check('Escudo NO visible al inicio (sin escudo aún)', isKnightGLB && !kv.hasShieldVisible);

  // texturas
  const pbrKeys = Object.keys(g.world.assets.pbr || {});
  check('Texturas PBR cargadas (>= 8 sets)', pbrKeys.length >= 8, pbrKeys.length + ':' + pbrKeys.slice(0, 3).join(','));
  check('Textura de arce cargada', !!g.world.assets.mapleBark);

  // ------------------------------------------------------------
  // aldeanos: medición de altura DEFORMADA (skinned sampling)
  // ------------------------------------------------------------
  mark('villagers-wait');
  await wait(7000);
  const measure = (obj3d) => {
    obj3d.updateMatrixWorld(true);
    let minY = Infinity, maxY = -Infinity;
    // a REAL Vector3 (applyBoneTransform/localToWorld need its methods)
    const v = new g.player.velocity.constructor();
    obj3d.traverse((o) => {
      if (!o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
      o.updateWorldMatrix(true, false);
      const pos = o.geometry.attributes.position;
      const stride = Math.max(1, Math.floor(pos.count / 220));
      for (let i = 0; i < pos.count; i += stride) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        o.applyBoneTransform(i, v);
        o.localToWorld(v);
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
    });
    return Number.isFinite(minY) ? maxY - minY : -1;
  };
  mark('player-measure');
  const playerH = measure(g.player.model.root);
  check('Altura del jugador ~1.95 m (1.6–2.3)', playerH > 1.6 && playerH < 2.3, playerH.toFixed(2));

  mark('villager-measure');
  const hs = [];
  let glbCount = 0;
  for (const npc of g.npcs) {
    if (npc.model?.constructor?.name === 'VillagerModelGLB') glbCount++;
    const h = measure(npc.model.root);
    if (h > 0) hs.push(h);
  }
  check('Aldeanos con GLB humano (>= 7)', glbCount >= 7, `${glbCount}/9`);
  check('NINGÚN aldeano gigante (< 1.78 m)', hs.filter((h) => h > 1.78).length === 0, hs.map((h) => h.toFixed(2)).join(','));
  check('Aldeanos no enanos (> 1.35 m)', hs.filter((h) => h < 1.35).length === 0, `min=${hs.length ? Math.min(...hs).toFixed(2) : '?'}`);
  const avgV = hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 0;
  check('Aldeanos más pequeños que el jugador', avgV < playerH, `avg=${avgV.toFixed(2)} < ${playerH.toFixed(2)}`);

  window.__kotfsE2ELogA = log;
  mark('done');
  return 'done';
})()
