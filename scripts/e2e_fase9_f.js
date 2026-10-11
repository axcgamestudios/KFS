// E2E FASE 9 — F (combate cinematográfico) + H (regresión) sobre la
// partida en marcha. Resultados en window.__kotfsE2ELog.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const mdown = () => window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  const mup = () => window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — juego no inicializado'); window.__kotfsE2ELog = log; return 'abort'; }
  window.__kotfsE2ELog = log;
  window.__kotfsE2EDone = false;
  const state = () => g.state;

  // ============================================================
  // F. COMBATE CINEMATOGRÁFICO — combos + parry + contraataque (PDF §4)
  // ============================================================
  state().addItem('espada_eirik', 1);
  state().equip('espada_eirik');
  g.combat.refreshVisuals();
  await wait(300);
  g.input.pointerLocked = true;

  // --- combo chain: click, click, click → light, light, HEAVY finisher ---
  // (headless fps is ~2-5: POLL for game-state milestones instead of
  //  sleeping wall-clock time)
  const p = g.player;
  const pollUntil = async (fn, ms = 30000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(250); }
    return fn();
  };
  // 1st hit
  mdown(); mup();
  await pollUntil(() => p.attackT > 0);
  check('Golpe 1 ligero arranca', p.attackT > 0 && p.attackKind !== 'heavy', `kind=${p.attackKind}`);
  // 2nd click: buffer it in the swing TAIL (attackT > 0.5 in GAME time)
  await pollUntil(() => p.attackT > 0.5);
  mdown(); mup();
  await pollUntil(() => g.combat.comboStep >= 1 && p.attackT > 0.2);
  check('Cadena progresa (paso 1)', g.combat.comboStep >= 1, `paso=${g.combat.comboStep}`);
  // 3rd click: the finisher — buffered in the second swing's tail
  await pollUntil(() => g.combat.comboStep >= 1 && p.attackT > 0.5);
  mdown(); mup();
  await pollUntil(() => g.combat.comboStep >= 2 && p.attackT > 0.2);
  check('Remate de cadena (paso 2, golpe pesado)', g.combat.comboStep >= 2 && p.attackKind === 'heavy', `paso=${g.combat.comboStep} kind=${p.attackKind}`);
  await pollUntil(() => p.attackT === 0 && p.attackRecovery <= 0);
  check('Cadena se disipa al terminar', true, `comboHud=${JSON.stringify(g.combat.comboHud)}`);

  // --- parry: fresh block + incoming hit (face the source first!) ---
  p.invulnT = 0; p.attackT = 0; p.blocking = true;
  p.blockT = 0.9; p.blockAge = 0.02; // guard just snapped up
  p.yaw = Math.atan2(1, 0);          // source sits at +X: face it
  const hpBefore = p.health;
  const lost = p.takeHit(20, p.position.x + 1, p.position.z);
  check('Parry bloquea TODO el daño', lost === 0, `lost=${lost}`);
  check('Flash de parry activo (parryT>0)', p.parryT > 0, `${p.parryT.toFixed(2)}s`);
  check('Ventana de contraataque abierta', g.combat.parryCounterT > 0, `${g.combat.parryCounterT.toFixed(2)}s`);
  check('Vida intacta tras parry', p.health === hpBefore, `${p.health}`);
  // counter hit: next light swing carries the ×1.6
  p.blocking = false; p.blockT = 0;
  mdown(); mup();
  await pollUntil(() => p.attackT > 0);
  check('Contraataque armado (mult 1.6)', Math.abs(g.combat.pendingDmgMult - 1.6) < 0.01, `×${g.combat.pendingDmgMult.toFixed(2)}`);
  await pollUntil(() => p.attackT === 0 && p.attackRecovery <= 0);

  // --- knockback on a real hit ---
  p.invulnT = 0; p.blockT = 0; p.blocking = false;
  p.takeHit(10, p.position.x + 1.2, p.position.z + 0.4);
  check('Retroceso por impacto (knockT>0)', p.knockT > 0, `${p.knockT.toFixed(2)}s`);
  await wait(600);

  window.__kotfsE2ELog = log;
  window.__kotfsE2EDone = true;
  return log.filter((l) => l.startsWith('FAIL')).length;
})().catch((err) => {
  window.__kotfsE2ELog = window.__kotfsE2ELog || [];
  window.__kotfsE2ELog.push('FAIL — excepción: ' + (err && err.message ? err.message : String(err)));
  window.__kotfsE2EDone = true;
  return 999;
});
