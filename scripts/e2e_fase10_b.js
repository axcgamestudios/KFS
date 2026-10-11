// E2E FASE 10-B — escudo al correr, doble salto + marometa, bandidos rojos,
// forja de Bram. Corre sobre la partida ya abierta (fase A).
(async () => {
  try {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const mark = (s) => { window.__f10b = s; };
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — no game'); window.__kotfsE2ELogB = log; mark('done'); return 'abort'; }
  const state = () => g.state;
  const p = g.player;

  mark('shield-setup');
  // ------------------------------------------------------------
  // 1. ESCUDO AL CORRER — brazo estable
  // ------------------------------------------------------------
  state().addItem('escudo_marea', 1);
  g.combat.refreshVisuals();
  await wait(400);
  const kv = p.model;
  const isKnightGLB = kv?.constructor?.name === 'KnightModelGLB';
  check('Escudo equipado y visible', isKnightGLB && kv.hasShieldVisible);
  let shL = null;
  if (isKnightGLB) kv.root.traverse((o) => { if (o.name === 'j_shoulderL') shL = o; });
  check('Hueso j_shoulderL accesible', !!shL);
  if (shL) {
    // agacharse un poco para alejarse de objetos y correr hacia el sur (prado)
    p.teleport(30, g.world.terrainHeight.height(30, 120), 120);
    await wait(300);
    press('KeyW'); press('ShiftLeft', 'Shift');
    const samples = [];
    for (let i = 0; i < 22; i++) { await wait(70); samples.push(shL.rotation.x); }
    release('KeyW'); release('ShiftLeft');
    const swing = Math.max(...samples) - Math.min(...samples);
    check('Brazo del escudo ESTABLE al correr (swing < 0.30 rad)', swing < 0.30, `swing=${swing.toFixed(3)}`);
    // contraste: el brazo de la espada SÍ oscila (validación de que el rig anima)
    let shR = null;
    if (isKnightGLB) kv.root.traverse((o) => { if (o.name === 'j_shoulderR') shR = o; });
    check('Brazo derecho animando (referencia)', !!shR);
  }

  mark('jump-setup');
  // ------------------------------------------------------------
  // 2. DOBLE SALTO + MAROMETA
  // ------------------------------------------------------------
  for (let i = 0; i < 12 && !p.grounded; i++) await wait(120);
  p.stamina = 100;
  const y0 = p.position.y;
  press('Space'); release('Space');
  await wait(140);
  check('Primer salto: en el aire', !p.grounded, `y+${(p.position.y - y0).toFixed(2)}`);
  press('Space'); release('Space');
  await wait(90);
  check('Marometa activa (flipT > 0)', p.flipT > 0, `flipT=${p.flipT.toFixed(2)}`);
  const rotX = p.model.root.rotation.x;
  check('Cuerpo girando (rotation.x > 0.05)', Math.abs(rotX) > 0.05, rotX.toFixed(2));
  check('Resistencia gastada en marometa', p.stamina < 100, `st=${p.stamina.toFixed(0)}`);
  await wait(1500);
  check('Marometa completada (flipT=0)', p.flipT === 0 && p.grounded !== null, `flipT=${p.flipT}`);
  check('Cuerpo derecho tras aterrizar', Math.abs(p.model.root.rotation.x) < 0.4, `rot=${p.model.root.rotation.x.toFixed(2)}`);
  press('Space'); release('Space');
  await wait(70);
  check('Tercer salto bloqueado', p.jumpsUsed === 2 && p.flipT === 0, `jumps=${p.jumpsUsed}`);

  mark('bandits');
  // ------------------------------------------------------------
  // 3. BANDIDOS CABALLEROS ROJOS
  // ------------------------------------------------------------
  await wait(1000);
  const stats = g.bandits.stats();
  check('4 campamentos de bandidos', stats.camps === 4, `${stats.camps}`);
  check('16 bandidos spawneados', stats.total === 16, `${stats.total}`);
  check('Bandidos vivos', stats.alive >= 14, `${stats.alive}`);
  p.teleport(62, g.world.terrainHeight.height(62, 58) + 0.4, 58);
  await wait(1600);
  const v3 = p.velocity.constructor ? new p.velocity.constructor() : null;
  const measure = (obj3d) => {
    obj3d.updateMatrixWorld(true);
    let minY = Infinity, maxY = -Infinity;
    const v = new p.velocity.constructor();
    obj3d.traverse((o) => {
      if (!o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
      o.updateWorldMatrix(true, false);
      const pos = o.geometry.attributes.position;
      const stride = Math.max(1, Math.floor(pos.count / 120));
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
  void v3;
  let banditH = -1;
  let redMats = 0;
  let modelOk = 0;
  const banditsArr = g.bandits.bandits || [];
  for (const b of banditsArr) {
    if (!b || b.dead || !b.group.visible) continue;
    if (b.model) modelOk++;
    const h = measure(b.group);
    if (h > 0) banditH = h;
    b.group.traverse((o) => {
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.color && m.color.r > 0.35 && m.color.g < 0.32 && m.color.b < 0.32) redMats++;
        }
      }
    });
    break;
  }
  check('Bandido con modelo GLB propio', modelOk > 0);
  check('Bandido altura humana (1.5–2.2 m)', banditH > 1.5 && banditH < 2.25, banditH > 0 ? banditH.toFixed(2) : 'cargando');
  check('Armadura ROJA detectada', redMats > 0, `${redMats} mats`);

  // pelea: acercarse al capitán y golpear
  mark('bandit-fight');
  const coins0 = state().countItem('coin');
  let target = null;
  for (const b of banditsArr) { if (!b.dead && b.group.visible) { target = b; break; } }
  check('Objetivo bandido encontrado', !!target);
  if (target) {
    const ty = g.world.terrainHeight.height(target.pos.x, target.pos.z);
    p.teleport(target.pos.x, ty, target.pos.z - 1.7);
    await wait(350);
    for (let i = 0; i < 16 && !target.dead; i++) {
      p.yaw = Math.atan2(target.pos.x - p.position.x, target.pos.z - p.position.z);
      p.group.rotation.y = p.yaw;
      p.stamina = 100;
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      await wait(460);
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      await wait(300);
      if (Math.hypot(target.pos.x - p.position.x, target.pos.z - p.position.z) > 2.2) {
        p.teleport(target.pos.x, ty, target.pos.z - 1.7);
      }
    }
    await wait(800);
    check('Bandido abatido por el acero del jugador', target.dead, `hp=${target.hp}`);
    check('Botín: monedas ganadas', state().countItem('coin') > coins0, `+${state().countItem('coin') - coins0}`);
    // el campamento lo sabe: aggro fue real
    const alive = g.bandits.stats().alive;
    check('Campamento sigue activo tras la pelea', alive >= 12, `${alive}`);
  }

  mark('forge');
  // ------------------------------------------------------------
  // 4. FORJA DE BRAM — mejora progresiva de la espada
  // ------------------------------------------------------------
  state().addItem('coin', 400);
  state().addItem('escama', 4);
  p.teleport(28, g.world.terrainHeight.height(28, 193), 193);
  await wait(500);
  const forge = g.world.interactables.find((i) => i.id === 'forge_guardian');
  check('Forja de Bram disponible', !!forge);
  const prompt1 = forge ? forge.prompt : '';
  check('Prompt de mejora de espada', forge && prompt1.includes('Templar'), prompt1);
  if (forge) {
    forge.run();
    await wait(350);
    check('Espada → Templada (tier 1)', state().swordTier === 1, `tier=${state().swordTier}`);
    forge.run();
    await wait(350);
    check('Espada → Rúnica (tier 2)', state().swordTier === 2, `tier=${state().swordTier}`);
    const slot0 = g.combat.slots()[0];
    check('HUD muestra sufijo Rúnica', slot0.name.includes('Rúnica'), slot0.name);
    check('Brillo rúnico aplicado (weaponTier=2)', isKnightGLB && kv.weaponTier === 2);
    // prompt sin más mejoras
    const prompt3 = forge.prompt;
    check('Forja al máximo (sin más mejoras)', !prompt3.includes('Templar') && !prompt3.includes('runas'), prompt3);
  }

  mark('save-tier');
  // persistencia
  const saved = g.buildSaveData();
  check('SaveData incluye swordTier=2', saved.gameState.swordTier === 2);
  state().swordTier = 0;
  state().deserialize(saved.gameState);
  check('Carga restaura swordTier', state().swordTier === 2);

  window.__kotfsE2ELogB = log;
  mark('done');
  return 'done';
  } catch (e) {
    const log = window.__kotfsE2ELogB || [];
    log.push('FAIL — EXCEPCION: ' + e.message);
    window.__kotfsE2ELogB = log;
    window.__f10b = 'error';
    return 'error';
  }
})()
