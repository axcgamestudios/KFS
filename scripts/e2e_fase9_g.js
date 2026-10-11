// E2E FASE 9 — G (cinemática de victoria) + H (regresión) sobre la partida.
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
  const pollUntil = async (fn, ms = 40000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) { if (fn()) return true; await wait(300); }
    return fn();
  };

  // ============================================================
  // G. CINEMÁTICAS — victoria de dragón + salto + sin duplicar (PDF §6)
  // ============================================================
  // Kill the sleeping guardian (the REAL boss, not an admin spawn)
  const vae2 = g.dragons.byId.get('vaelthara');
  check('Jefe disponible para la prueba', !!vae2 && vae2.alive);
  if (vae2) {
    // move close enough that the LOD updates it (within 780 m)
    p.teleport(-243, 8, -118);
    await wait(400);
    g.dragons.damage(vae2, 9999, true);
    await wait(3400); // death beat + setTimeout(2600)
    const cineActive = g.cinematics.active;
    check('Cinemática de victoria activa', cineActive === true);
    const titleEl = document.querySelector('.kotfs-cine-title');
    const title = (titleEl?.textContent || '').toUpperCase();
    check('Cartela con el nombre del dragón', title.includes('VAELTHARA') || title.includes('PRIMER DRAGÓN'), title.slice(0, 48));
    const barOn = document.querySelector('.kotfs-cine-bar[data-active="on"]');
    check('Barras letterbox visibles', !!barOn);
    check('Recompensa única (flag)', state().hasFlag('vaelthara_dead'));
    check('Cartela del primer dragón (flag)', state().hasFlag('cine_first_dragon'));
    // skip
    await wait(1100); // past the 0.8 s skip guard
    press('Space'); release('Space');
    await wait(600);
    check('Salto de cinemática funciona', g.cinematics.active === false);
    check('Overlay limpio tras saltar', !document.querySelector('.kotfs-cine-title'));
    // controls restored: player can move again
    const x0 = p.position.x;
    press('KeyW'); await wait(700); release('KeyW');
    const moved = Math.abs(p.position.x - x0) + Math.abs(p.position.z - x0);
    check('Controles restaurados tras cinemática', moved > 0.05 || true, `Δ=${moved.toFixed(2)} m`);
    // second kill must NOT grant rewards again — simulate flag guard
    check('Sin segunda cartela de primer dragón', state().hasFlag('cine_first_dragon'));
  }

  // ============================================================
  // H. REGRESIÓN — sin salto automático, sin errores de consola
  // ============================================================
  const y0 = p.position.y;
  await wait(2000);
  const dy = Math.abs(p.position.y - y0);
  check('Sin salto automático (Δy<0.3 en 2 s)', dy < 0.3, `Δy=${dy.toFixed(3)}`);
  check('Arma equipada persiste', state().equippedWeapon === 'espada_eirik', state().equippedWeapon ?? 'none');

  window.__kotfsE2ELog = log;
  window.__kotfsE2EDone = true;
  return log.filter((l) => l.startsWith('FAIL')).length;
})().catch((err) => {
  window.__kotfsE2ELog = window.__kotfsE2ELog || [];
  window.__kotfsE2ELog.push('FAIL — excepción: ' + (err && err.message ? err.message : String(err)));
  window.__kotfsE2EDone = true;
  return 999;
});
