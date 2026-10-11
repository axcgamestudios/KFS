// E2E Fase 3 — B (robust): Skarnvind sea event, Ancestor final boss,
// save/load with dragon flags, legacy regressions.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, timeoutMs = 30000, step = 250) => {
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

  // ---- 1. Sail south into the hunting corridor → Skarnvind event ----
  if (!g.naval.playerShip) g.launchShip();
  await wait(600);
  // Move the EXISTING Colibrí into the corridor (spawnPlayerShip only
  // creates when absent — it will not reposition a live ship)
  const ship = g.naval.playerShip;
  ship.pos.set(0, 0, 430);
  ship.heading = Math.PI;
  ship.group.position.set(0, 0.12, 430);
  ship.hull.rotation.set(0, 0, 0);
  g.naval.playerBoardsHelm();
  g.attachPlayerToWheel();
  g.rig.setShipMode(ship);
  g.player.health = 100;
  const sailingOk = await until(() => g.naval.playerSailing === true, 10000);
  check('Navegando en el corredor de caza', !!sailingOk, `z=${ship.pos.z.toFixed(0)}`);
  const sea = await until(() => g.dragons.dragons.find((d) => d.def.id === 'skarnvind'), 30000);
  check('Skarnvind aparece en el mar', !!sea && g.dragons.seaEventState === 'active', `state=${g.dragons.seaEventState} z=${ship.pos.z.toFixed(0)}`);
  // Hold position: anchor so the fight stays in the corridor
  ship.anchored = true;
  ship.sailState = 0;
  const seen8 = await until(() => state().hasFlag('skarnvind_seen'), 10000);
  check('Flag skarnvind_seen (Q8)', !!seen8);
  const barSea = await until(() => document.body.textContent.toUpperCase().includes('WYVERN DE LAS BRUMAS'), 10000);
  check('Barra de jefe SKARNVIND visible', !!barSea);
  // Broadside hit-test: cannons can reach the wyvern
  const hitTest = sea ? g.dragons.projectileHitTest(sea.pos, 3.0) : null;
  check('Cañonadas pueden alcanzar al wyvern', hitTest === sea);
  // The wyvern breathes fire at the ship (hull takes damage)
  const hull0 = ship.hullHp;
  let hullDropped = false;
  for (let i = 0; i < 140; i++) {
    if (ship.hullHp < hull0 - 3) { hullDropped = true; break; }
    if (!sea || sea.state === 'dead' || !sea.alive) break;
    g.player.health = 100;
    await wait(500);
  }
  check('El fuego del wyvern daña el casco', hullDropped, `hull ${hull0} → ${ship.hullHp.toFixed(0)}`);
  window.__shotB_sea = true;
  // Kill it → crash + rewards + Q8 completes
  if (sea) g.dragons.damage(sea, 9999, false);
  const seaDead = await until(() => state().hasFlag('skarnvind_dead'), 90000);
  check('Skarnvind abatido', !!seaDead, `state=${sea?.state}`);
  const gotClaw = await until(() => state().hasItem('garra_skarnvind'), 15000);
  check('Garra de Skarnvind obtenida', !!gotClaw);
  const q8done = await until(() => state().isQuestCompleted('q8_skarnvind') && state().isQuestActive('q9_ancestro'), 20000);
  check('Q8 completada → Q9 activa', !!q8done, state().currentTracker()?.title ?? 'none');

  // ---- 2. Disembark: back on foot for the final climb ----
  g.naval.playerSailing = false;
  g.rig.setShipMode(null);
  g.player.platformProbe = undefined;
  await wait(400);

  // ---- 3. The Ancestor at the Nido de Garrahielo ----
  const anc = g.dragons.dragons.find((d) => d.def.id === 'ancestro');
  check('Ancestro dormido en el nido', !!anc && anc.state === 'sleep', `state=${anc?.state}`);
  const ap = anc.def.home;
  g.player.teleport(ap.x + 12, g.world.terrainHeight.height(ap.x + 12, ap.z) + 0.1, ap.z);
  await until(() => g.player.grounded, 10000);
  g.rig.yaw = Math.atan2(ap.x - g.player.position.x, ap.z - g.player.position.z);
  g.rig.pitch = 0.16;
  g.rig.snapBehind(g.player.position);
  const woke2 = await until(() => anc.aggro === true && anc.state !== 'sleep', 30000);
  check('Ancestro despierta (intro)', !!woke2 && state().hasFlag('ancestro_seen'), `state=${anc.state}`);
  window.__shotB_lair = true;
  const barAnc = await until(() => document.body.textContent.toUpperCase().includes('VAELYX'), 10000);
  check('Barra VAELYX visible', !!barAnc);
  // Phase 2 → lands; Phase 3 → enrage
  g.dragons.damage(anc, anc.def.maxHp * 0.6, false);
  await wait(900);
  check('Fase 2 del Ancestro', anc.phase === 2, `phase=${anc.phase}`);
  g.dragons.damage(anc, anc.def.maxHp * 0.35, false);
  await wait(900);
  check('Fase 3 (furia) del Ancestro', anc.phase === 3, `phase=${anc.phase}`);
  // The boss actually attacks
  let ancAttack = false;
  for (let i = 0; i < 100; i++) {
    if (anc.state === 'windup' || anc.state === 'strike') { ancAttack = true; break; }
    g.player.health = 100;
    await wait(300);
  }
  check('Ancestro ataca', ancAttack, `state=${anc.state}`);
  // Death → chapter complete
  g.dragons.damage(anc, 99999, false);
  const ancDead = await until(() => state().hasFlag('ancestro_dead'), 90000);
  check('Ancestro muerto', !!ancDead, `state=${anc.state}`);
  const gotFang = await until(() => state().hasItem('colmillo_ancestro'), 15000);
  check('Colmillo del Ancestro obtenido', !!gotFang);
  const q9done = await until(() => state().isQuestCompleted('q9_ancestro'), 20000);
  check('Q9 completada — CAPÍTULO III', !!q9done);

  // ---- 4. Save + load: dragon flags persist, no duplicated rewards ----
  const coins = state().countItem('coin');
  const escamas = state().countItem('escama');
  const ok = g.saveToSlot(0);
  await wait(1200);
  const raw = JSON.parse(localStorage.getItem('kotfs_save_0') || '{}');
  check('Guardado con flags de dragones', ok && raw.gameState.flags.includes('vaelthara_dead') && raw.gameState.flags.includes('ancestro_dead') && raw.gameState.flags.includes('skarnvind_dead'));
  const loaded = g.loadFromSlot(0);
  await wait(2500);
  check('Carga correcta', loaded === true);
  const syncOk = await until(() => {
    const v = g.dragons.dragons.find((d) => d.def.id === 'vaelthara');
    const a = g.dragons.dragons.find((d) => d.def.id === 'ancestro');
    return v?.state === 'dead' && a?.state === 'dead' && g.dragons.seaEventState === 'done';
  }, 15000);
  check('Dragones muertos siguen muertos tras cargar', !!syncOk, `sea=${g.dragons.seaEventState}`);
  check('Sin recompensas duplicadas', state().countItem('coin') === coins && state().countItem('escama') === escamas, `coins=${coins} esc=${escamas}`);
  check('Armas persisten tras cargar', state().hasItem('hacha_orden') && state().hasItem('arco_naufragio') && state().hasItem('escudo_marea'));
  const anc2 = g.dragons.dragons.find((d) => d.def.id === 'ancestro');
  check('Jefe ya derrotado no reaparece vivo', anc2.state === 'dead');

  // ---- 5. Legacy regressions still intact ----
  check('Misiones I-IX completadas', state().isQuestCompleted('q1_legacy') && state().isQuestCompleted('q5_raven') && state().isQuestCompleted('q9_ancestro'));
  check('Colibrí reparado (Fase 2 intacta)', state().hasFlag('ship_repaired'));
  const track = state().currentTracker();
  check('Tracker vacío al completar todo', track === null, track?.title ?? 'none');
  // NPCs still walking (Fase 2 fix)
  let moving = 0;
  for (let i = 0; i < 8; i++) {
    await wait(600);
    for (const npc of g.npcs) if (npc.moving) moving++;
  }
  check('NPCs siguen paseando (media ≥1)', moving / 8 >= 1, `avg=${(moving / 8).toFixed(1)}`);
  check('FPS estable (>8)', g.engine.fps > 8, `fps=${g.engine.fps}`);

  log.push('PART-B-DONE');
  return 'done';
})()
