// E2E Fase 3 — A2 (robust): swim, deterministic drakeling melee, dodge, block,
// bow, Vaelthara wake + boss bar. Poll-based (headless fps compensation).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, timeoutMs = 20000, step = 200) => {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      try { const v = fn(); if (v) return v; } catch { /* keep polling */ }
      await wait(step);
    }
    return null;
  };
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  window.__kotfsE2ELog = log;
  const g = window.__kotfsGame;
  const state = () => g.state;
  const mdown = (b = 0) => window.dispatchEvent(new MouseEvent('mousedown', { button: b, bubbles: true }));
  const mup = (b = 0) => window.dispatchEvent(new MouseEvent('mouseup', { button: b, bubbles: true }));

  // ---- 1. Swimming in the visible bay ----
  g.player.teleport(30, 0.3, 310);
  const swam = await until(() => g.player.swimming === true, 12000);
  check('Natación activa en el agua', !!swam);
  g.rig.yaw = Math.PI * 0.6; g.rig.pitch = 0.25; g.rig.snapBehind(g.player.position);

  // ---- 2. Deterministic melee vs the drakeling of the Vigilias ----
  const drake = g.dragons.dragons.find((d) => d.def.id === 'drake_stones');
  check('Drakeling existe y vivo', !!drake && drake.alive, `state=${drake?.state}`);
  // Freeze it in place for a controlled hit test (restore later)
  const savedSpeed = drake.def.speedGround;
  drake.def.speedGround = 0;
  const dp = drake.pos;
  g.player.teleport(dp.x + 2.4, g.world.terrainHeight.height(dp.x + 2.4, dp.z) + 0.05, dp.z);
  await until(() => g.player.grounded, 8000);
  g.player.yaw = Math.atan2(dp.x - g.player.position.x, dp.z - g.player.position.z);
  g.rig.yaw = g.player.yaw; g.rig.pitch = 0.2; g.rig.snapBehind(g.player.position);
  g.state.equip('espada_eirik');
  g.combat.refreshVisuals();
  g.input.pointerLocked = true;
  const aggro1 = await until(() => drake.aggro === true, 15000);
  check('Drakeling aggredo', !!aggro1, `state=${drake.state}`);
  const dist = Math.hypot(drake.pos.x - g.player.position.x, drake.pos.z - g.player.position.z);
  log.push(`INFO — dist jugador-drakeling=${dist.toFixed(2)}m`);

  // Light attack: click & release (headshots deal ×1.5 → 30)
  const hp0 = drake.hp;
  mdown(0); await wait(60); mup(0);
  const lightHit = await until(() => drake.hp !== hp0, 15000);
  const lightDmg = hp0 - drake.hp;
  check('Ataque ligero conecta (20/30 daño)', lightHit === true && (lightDmg === 20 || lightDmg === 30), `hp ${hp0} → ${drake.hp}`);
  // Heavy attack: hold until the heavy swing actually STARTS (fps-proof)
  await until(() => g.player.attackT === 0 && g.player.attackRecovery <= 0, 15000);
  const hp1 = drake.hp;
  mdown(0);
  const heavyStarted = await until(() => g.player.attackKind === 'heavy' && g.player.attackT > 0, 20000);
  mup(0);
  const heavyHit = await until(() => drake.hp !== hp1, 20000);
  const heavyDmg = hp1 - drake.hp;
  check('Ataque pesado conecta (34/51 daño)', heavyStarted === true && heavyHit === true && (heavyDmg === 34 || heavyDmg === 51), `hp ${hp1} → ${drake.hp}`);

  // Dodge roll
  await until(() => g.player.attackT === 0, 8000);
  const st0 = g.player.stamina;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', bubbles: true }));
  const rolled = await until(() => g.player.rolling, 4000);
  check('Esquiva (C) rueda y gasta resistencia', !!rolled && g.player.stamina < st0, `st ${st0.toFixed(0)} → ${g.player.stamina.toFixed(0)}`);

  // Block
  await until(() => g.player.attackT === 0 && !g.player.rolling, 8000);
  mdown(2);
  const blocked = await until(() => g.player.blockT > 0.5, 6000);
  check('Bloqueo (clic der.) activa la pose', !!blocked, `blockT=${g.player.blockT.toFixed(2)}`);
  mup(2);

  // Restore the drake's speed and finish it (rewards pipeline)
  drake.def.speedGround = savedSpeed;
  g.dragons.damage(drake, 200, false);
  const dead1 = await until(() => state().hasFlag('drake_stones_dead'), 60000);
  check('Drakeling muerto + flag', !!dead1, `state=${drake.state}`);
  const loot1 = await until(() => state().hasItem('escama') && state().hasItem('flecha'), 8000);
  check('Botín (escama + flechas)', !!loot1, `esc=${state().countItem('escama')} fl=${state().countItem('flecha')}`);

  // ---- 3. Bow vs the grotto drakeling ----
  state().addItem('arco_naufragio', 1);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4', key: '4', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit4', bubbles: true }));
  const bowEq = await until(() => state().equippedWeapon === 'arco_naufragio', 5000);
  check('Tecla 4 equipa el arco', !!bowEq, state().equippedWeapon ?? 'none');

  const drake2 = g.dragons.dragons.find((d) => d.def.id === 'drake_grotto');
  // Freeze + reposition it deterministically in front of the player
  const savedSpeed2 = drake2.def.speedGround;
  drake2.def.speedGround = 0;
  drake2.pos.set(drake2.def.home.x + 6, g.world.terrainHeight.height(drake2.def.home.x + 6, drake2.def.home.z) + 1.28 * drake2.def.scale, drake2.def.home.z);
  const dp2 = drake2.pos;
  g.player.teleport(dp2.x + 10, g.world.terrainHeight.height(dp2.x + 10, dp2.z) + 0.05, dp2.z);
  await until(() => g.player.grounded, 8000);
  g.player.yaw = Math.atan2(dp2.x - g.player.position.x, dp2.z - g.player.position.z);
  g.rig.yaw = g.player.yaw; g.rig.pitch = 0.3; g.rig.snapBehind(g.player.position);
  const aggro2 = await until(() => drake2.aggro === true, 20000);
  check('Drakeling de la gruta aggredo', !!aggro2, `state=${drake2.state}`);

  const arrows0 = state().countItem('flecha');
  const hp2 = drake2.hp;
  mdown(0);
  const drew = await until(() => g.player.bowDraw >= 0.99, 20000);
  check('Arco se tensa (mantener clic)', !!drew, `draw=${g.player.bowDraw.toFixed(2)}`);
  // Aim the camera dead-on at the drake's head, THEN release (combat runs
  // before the rig in the game loop, so this frame's shot uses this pose)
  const cam = g.engine.camera;
  const head2 = { x: drake2.pos.x, y: drake2.pos.y + 1.1, z: drake2.pos.z };
  const px2 = g.player.position.x, pz2 = g.player.position.z;
  const back = 4.5;
  // Put the camera behind the player along the player→drake axis, at head height
  const toD = { x: head2.x - px2, z: head2.z - pz2 };
  const toDlen = Math.hypot(toD.x, toD.z) || 1;
  cam.position.set(px2 - toD.x / toDlen * back, g.player.position.y + 2.0, pz2 - toD.z / toDlen * back);
  cam.lookAt(head2.x, head2.y, head2.z);
  mup(0);
  const arrowSpent = await until(() => state().countItem('flecha') < arrows0, 8000);
  check('Flecha consume munición', !!arrowSpent, `${arrows0} → ${state().countItem('flecha')}`);
  const arrowHit = await until(() => drake2.hp < hp2, 20000);
  check('Flecha daña al dragón', !!arrowHit, `hp ${hp2} → ${drake2.hp}`);
  drake2.def.speedGround = savedSpeed2;
  g.dragons.damage(drake2, 300, false);
  const dead2 = await until(() => state().hasFlag('drake_grotto_dead'), 60000);
  check('Drakeling de la gruta muerto', !!dead2, `state=${drake2.state}`);

  // ---- 4. VAELTHARA wakes (boss nº1) ----
  const boss = g.dragons.dragons.find((d) => d.def.id === 'vaelthara');
  check('Vaelthara dormida en las ruinas', !!boss && boss.state === 'sleep', `state=${boss?.state}`);
  const bp = boss.def.home;
  g.player.teleport(bp.x + 10, g.world.terrainHeight.height(bp.x + 10, bp.z) + 0.05, bp.z);
  await until(() => g.player.grounded, 8000);
  g.rig.yaw = Math.atan2(bp.x - g.player.position.x, bp.z - g.player.position.z);
  g.rig.pitch = 0.18;
  g.rig.snapBehind(g.player.position);
  const woke = await until(() => boss.aggro === true && boss.state !== 'sleep', 25000);
  check('Vaelthara despierta enfurecida', !!woke, `state=${boss.state}`);
  check('Flag vaelthara_seen (Q6)', state().hasFlag('vaelthara_seen'));
  const bossBar = await until(() => document.body.textContent.toUpperCase().includes('VAELTHARA'), 8000);
  check('Barra de jefe VAELTHARA visible', !!bossBar);

  log.push('PART-A2-DONE');
  return 'done';
})()
