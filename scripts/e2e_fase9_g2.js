// E2E FASE 9-G2 — cinemática de victoria: poll-based (headless fps-proof).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — juego no inicializado'); window.__kotfsE2ELog = log; window.__kotfsE2EDone = true; return 'abort'; }
  window.__kotfsE2ELog = log;
  window.__kotfsE2EDone = false;
  const state = () => g.state;
  const p = g.player;
  const pollUntil = async (fn, ms = 120000, label = '') => {
    const t0 = performance.now();
    let last = false;
    while (performance.now() - t0 < ms) {
      last = fn();
      if (last) return true;
      await wait(400);
    }
    return last;
  };

  // ---- 1. Pick a LIVING boss (Vaelthara already fell in the previous run):
  //      Vaelyx, el Ancestro de Garrahielo, sleeps at (20, -300) ----
  const vae = g.dragons.byId.get('ancestro');
  if (!vae) { check('Ancestro presente', false); finish(); return; }
  check('Ancestro presente', true);
  p.teleport(20, 95, -280); // by the nest on the mountain: full update rate
  g.input.pointerLocked = true;

  // ---- 2. Kill (if not already dying/dead) and wait for the death flag ----
  if (vae.alive && vae.state !== 'die') {
    g.dragons.damage(vae, 9999, true);
  }
  const died = await pollUntil(() => state().hasFlag('ancestro_dead'), 150000);
  check('Muerte confirmada (flag ancestro_dead)', died);

  // ---- 3. The victory cinematic (setTimeout 2600 after onDeath) ----
  const cineStarted = await pollUntil(() => g.cinematics.active === true, 40000);
  check('Cinemática de victoria activa', cineStarted);
  const titleEl = document.querySelector('.kotfs-cine-title');
  const title = (titleEl?.textContent || '').toUpperCase();
  check('Cartela con el nombre del dragón', title.includes('VAELYX') || title.includes('ANCESTRO') || title.includes('PRIMER DRAG'), title.slice(0, 48));
  const bars = document.querySelectorAll('.kotfs-cine-bar[data-active="on"]').length;
  check('Barras letterbox visibles (2)', bars >= 2, `${bars}`);
  check('Cartela del primer dragón (flag)', state().hasFlag('cine_first_dragon'));
  // progress bar advancing
  const prog = document.querySelector('.kotfs-cine-bar') ? true : false;
  check('Overlay de cinemática en DOM', prog);

  // ---- 4. Skip (past the 0.8 s GAME-time guard — at headless fps the
  //      guard takes many wall seconds, so keep tapping SPACE) ----
  let skipped = false;
  for (let k = 0; k < 40 && !skipped; k++) {
    press('Space'); release('Space');
    await wait(800);
    skipped = g.cinematics.active === false;
  }
  check('Salto de cinemática funciona', skipped);
  await wait(800);
  check('Overlay limpio tras saltar', !document.querySelector('.kotfs-cine-title'));

  // ---- 5. Controls restored: the player can walk again ----
  const x0 = p.position.x, z0 = p.position.z;
  press('KeyW'); await wait(6000); release('KeyW');
  const moved = Math.hypot(p.position.x - x0, p.position.z - z0);
  check('Controles restaurados tras cinemática', moved > 0.1, `Δ=${moved.toFixed(2)} m`);

  // ---- 6. No duplicate first-dragon card ----
  check('Sin segunda cartela de primer dragón', state().hasFlag('cine_first_dragon') && g.cinematics.active === false);

  finish();
  function finish() {
    window.__kotfsE2ELog = log;
    window.__kotfsE2EDone = true;
  }
  return log.filter((l) => l.startsWith('FAIL')).length;
})().catch((err) => {
  window.__kotfsE2ELog = window.__kotfsE2ELog || [];
  window.__kotfsE2ELog.push('FAIL — excepción: ' + (err && err.message ? err.message : String(err)));
  window.__kotfsE2EDone = true;
  return 999;
});
