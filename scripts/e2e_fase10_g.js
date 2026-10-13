// FASE 10-G — smoke final: arranque limpio tras todos los fixes (DialogueBox,
// HUD), sin errores de consola.
(async () => {
  try {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const mark = (s) => { window.__f10g = s; };
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  mark('boot');
  for (let i = 0; i < 80; i++) {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) break;
    await wait(400);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — no game'); window.__kotfsE2ELogG = log; mark('done'); return 'abort'; }
  g.input.requestLock = () => {};
  g.input.pointerLocked = true;
  g.engine.applyQuality('xlow');
  await wait(300);
  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  check('Menú carga', !!startBtn);
  startBtn.click();
  await wait(2500);
  press('Space'); release('Space');
  await wait(1500);
  check('Partida en marcha', g.state.questStates.size > 0);
  check('Espada de inicio equipada', g.state.equippedWeapon === 'espada_acero');
  check('Jugador KnightModelGLB', g.player.model.constructor.name === 'KnightModelGLB');

  // diálogo cinematográfico (DialogueBox reescrito)
  mark('dialogue');
  g.dialogue.startLore('Prueba final', ['La marea sube, la marea baja, y la maquina de escribir sigue contando la historia letra a letra.']);
  await wait(1200);
  check('Placa .kfs-dlg', !!document.querySelector('.kfs-dlg'));
  check('Nombre animado', !!document.querySelector('.kfs-dlg-name'));
  const l1 = (document.querySelector('.kfs-dlg p')?.textContent || '').length;
  await wait(3000);
  const l2 = (document.querySelector('.kfs-dlg p')?.textContent || '').length;
  check('Máquina de escribir avanza', l2 > l1, `${l1}→${l2}`);
  press('Escape'); release('Escape');
  await wait(800);
  check('Diálogo cierra', !document.querySelector('.kfs-dlg'));

  // HUD vivo (barras) + sin fase visible
  const hudOk = document.body.innerText.includes('FASE') === false;
  check('Sin textos de FASE en el HUD', hudOk);

  // final épico accesible vía admin API
  mark('ending');
  const ok = g.adminPlayCinematic('final_crown');
  await wait(2500);
  check('FINAL II preview', ok && g.endings.isPlaying);
  const def = g.endings.active;
  check('FINAL II 9 planos ~91 s', def && def.shots.length === 9, def ? def.shots.reduce((a, s) => a + s.dur, 0) + 's' : '?');
  g.endings.skip();
  await wait(800);
  check('Final saltable', !g.endings.isPlaying);

  window.__kotfsE2ELogG = log;
  mark('done');
  return 'done';
  } catch (e) {
    const log = window.__kotfsE2ELogG || [];
    log.push('FAIL — EXCEPCION: ' + e.message);
    window.__kotfsE2ELogG = log;
    window.__f10g = 'error';
    return 'error';
  }
})()
