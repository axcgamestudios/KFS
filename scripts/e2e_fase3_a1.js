// E2E Fase 3 — A1: menu title fix, new game, Chapter I→II skip, weapons & slots.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

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

  // ---- 1. FULL title in the menu (previous bug: FORGOTTEN SEAS invisible) ----
  const h1 = document.querySelector('h1');
  const titleText = (h1?.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
  check('Título completo en el menú', titleText.includes('KINGDOMS OF THE') && titleText.includes('FORGOTTEN SEAS'), titleText);
  const shineLetter = document.querySelector('.kotfs-letter-shine');
  let fillOk = false;
  if (shineLetter) {
    const cs = getComputedStyle(shineLetter);
    const fill = (cs.webkitTextFillColor && cs.webkitTextFillColor !== 'rgba(0, 0, 0, 0)') ? cs.webkitTextFillColor : cs.color;
    fillOk = !!fill && fill !== 'rgba(0, 0, 0, 0)' && fill !== 'transparent' && fill !== '';
    log.push(`INFO — fill de letra shine: ${fill}`);
  }
  check('Letras doradas visibles (shine per-letter)', fillOk);
  check('Subtítulo Capítulo III', document.body.textContent.includes('Capítulo III'));

  // ---- 2. New game ----
  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  check('Nueva partida disponible', !!startBtn);
  startBtn.click();
  await wait(2600);
  press('Space'); release('Space');
  await wait(1400);
  check('Q1 activa tras intro', state().currentTracker()?.title === 'El Legado de Eirik', state().currentTracker()?.title ?? 'none');

  // ---- 3. Skip Chapters I-II (covered by the Fase 2 E2E) ----
  state().startQuest('q1_legacy');
  state().setFlag('talked_aldric');
  await wait(300);
  state().setFlag('maren_met'); state().addItem('petalo', 3); state().setFlag('maren_herbs_done');
  await wait(300);
  state().setFlag('chest_opened'); state().setFlag('read_letter'); state().setFlag('aldric_ship_talked');
  await wait(300);
  state().talkMilestone('bram_refit'); state().addItem('madera', 4); state().addItem('lona', 3); state().addItem('cuerda', 2);
  state().interactMilestone('colibri_refit');
  await wait(700);
  check('Q5 activa tras capítulo II', state().isQuestActive('q5_raven'), state().currentTracker()?.title ?? 'none');
  state().setFlag('reached_crow'); state().setFlag('morwen_defeated'); state().addItem('sello', 1);
  await wait(700);
  check('Q6 (Fase 3) arranca tras Q5', state().isQuestActive('q6_alas'), state().currentTracker()?.title ?? 'none');
  state().setFlag('ship_repaired'); // set by the real refit interactable
  if (!g.naval.playerShip) g.launchShip();
  await wait(600);

  // ---- 4. Weapons: equip + quick slots ----
  state().addItem('espada_eirik', 1);
  state().equip('espada_eirik');
  g.combat.refreshVisuals();
  await wait(500);
  check('Espada equipada', state().equippedWeapon === 'espada_eirik');
  check('Slots de armas en HUD', document.body.textContent.toUpperCase().includes('ESPADA DE EIRIK'), 'weapon slot text');
  state().addItem('hacha_orden', 1);
  press('Digit2'); release('Digit2');
  await wait(450);
  check('Tecla 2 equipa el hacha', state().equippedWeapon === 'hacha_orden', state().equippedWeapon ?? 'none');
  press('Digit1'); release('Digit1');
  await wait(350);
  check('Tecla 1 vuelve a la espada', state().equippedWeapon === 'espada_eirik');

  // ---- 5. WATER — dock view over the bay ----
  g.player.teleport(22, 1.6, 256);
  g.rig.yaw = 0.15; g.rig.pitch = 0.35; g.rig.snapBehind(g.player.position);
  await wait(1000);
  check('Malla de agua en la escena', g.world.water.mesh.parent !== null, String(g.world.water.mesh.parent?.type));
  const info = g.engine.renderer.info;
  check('Escena dibujada (>10k triángulos)', info.render.triangles > 10000, `tris=${info.render.triangles}`);

  log.push('PART-A1-DONE');
  return 'done';
})()
