// E2E Fase 3 — A3: Vaelthara phases/attacks/death, Q6→Q7→Q8 chain via Aldric.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  window.__kotfsE2ELog = log;
  const g = window.__kotfsGame;
  const state = () => g.state;
  const boss = g.dragons.dragons.find((d) => d.def.id === 'vaelthara');

  // ---- 1. Phase 2 at 50% HP ----
  g.dragons.damage(boss, boss.def.maxHp * 0.55, false);
  await wait(800);
  check('Fase 2 al bajar del 50%', boss.phase === 2, `phase=${boss.phase}`);

  // ---- 2. The boss actually attacks (state machine live) ----
  let sawAttack = false;
  let sawFire = false;
  for (let i = 0; i < 90; i++) {
    if (boss.state === 'windup' || boss.state === 'strike') sawAttack = true;
    if (boss.state === 'strike' && boss.action === 'fire') sawFire = true;
    if (boss.state === 'fire_breath' || (boss.state === 'windup' && boss.action === 'fire')) sawFire = true;
    if (sawAttack && sawFire) break;
    g.player.health = 100; // harness safety
    // First half: melee band (close). Second half: stand in the fire band
    // (10-16m — out of claw reach, inside fireRange) so breath is chosen.
    const b = boss.pos;
    const d = Math.hypot(g.player.position.x - b.x, g.player.position.z - b.z);
    const want = i < 30 ? 5.5 : 12;
    if (Math.abs(d - want) > 3) {
      const k = want / (d || 1);
      g.player.teleport(b.x + (g.player.position.x - b.x) * k, g.world.terrainHeight.height(b.x + (g.player.position.x - b.x) * k, b.z + (g.player.position.z - b.z) * k) + 0.1, b.z + (g.player.position.z - b.z) * k);
      g.player.health = 100;
    }
    await wait(300);
  }
  check('Vaelthara ataca (windup/strike)', sawAttack, `state=${boss.state}`);
  check('Vaelthara escupe fuego', sawFire, `state=${boss.state} action=${boss.action}`);

  // ---- 3. Stagger mechanic: heavy hits break the boss open ----
  g.dragons.damage(boss, 120, true);
  await wait(500);
  check('Golpes pesados tambalean al jefe', boss.state === 'stagger', `state=${boss.state}`);
  await wait(2600);

  // ---- 4. Death + rewards ----
  g.dragons.damage(boss, 9999, false);
  const bossDead = await ((async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 70000) {
      if (state().hasFlag('vaelthara_dead')) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  })());
  check('Vaelthara muerta', bossDead === true, `state=${boss.state}`);
  const gotHeart = await ((async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 15000) {
      if (state().hasItem('corazon_marea')) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  })());
  check('Corazón de Marea obtenido', gotHeart === true, `corazones=${state().countItem('corazon_marea')}`);
  check('Barra de jefe limpiada', !document.body.textContent.toUpperCase().includes('GUARDIANA DE LAS RUINAS'));

  // ---- 5. Q6 dialogue chain (w-tree then r-tree) ----
  const goNpc = async (id, presses) => {
    const npc = g.npcs.find((n) => n.def.id === id);
    g.player.teleport(npc.position.x, npc.position.y + 0.05, npc.position.z + 0.9);
    await wait(900);
    press('KeyE', 'e'); release('KeyE');
    await wait(800);
    for (let i = 0; i < presses; i++) { press('Digit1', '1'); release('Digit1'); await wait(520); }
    await wait(800);
  };
  await goNpc('aldric', 4); // w-tree: dragon talk
  check('aldric_dragons_talked', state().hasFlag('aldric_dragons_talked'));
  await goNpc('aldric', 4); // r-tree: report (vaelthara_seen)
  check('aldric_report_talked', state().hasFlag('aldric_report_talked'));
  await wait(900);
  check('Q6 completada (hacha + pociones)', state().isQuestCompleted('q6_alas') && state().hasItem('hacha_orden'));
  // Q7 auto-starts from Q6 — poll for it
  const q7active = await ((async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 15000) {
      if (state().isQuestActive('q7_guardiana') || state().isQuestCompleted('q7_guardiana')) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  })());
  check('Q7 arranca tras Q6', q7active === true);
  await wait(600);
  check('Q7 completada (flag vaelthara_dead)', state().isQuestCompleted('q7_guardiana'));
  check('Escudo de Marea otorgado', state().hasItem('escudo_marea'));
  check('Q8 activa (Skarnvind)', state().isQuestActive('q8_skarnvind'), state().currentTracker()?.title ?? 'none');
  check('Hacha equipable tras Q6', state().hasItem('hacha_orden') && state().countItem('pocion') >= 2);

  log.push('PART-A3-DONE');
  return 'done';
})()
