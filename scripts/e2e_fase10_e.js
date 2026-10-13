// E2E FASE 10-E — panel admin + cinemáticas (intro, FINAL I preview) sin
// pausar el juego con Escape.
(async () => {
  try {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const mark = (s) => { window.__f10e = s; };
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — no game'); window.__kotfsE2ELogE = log; mark('done'); return 'abort'; }
  g.input.pointerLocked = true;

  // cerrar diálogo previo SIN Escape (que pausa): clic en una opción via API
  g.dialogue.close();
  await wait(800);

  mark('admin-open');
  press('KeyU'); press('KeyI'); press('KeyO');
  await wait(600);
  release('KeyU'); release('KeyI'); release('KeyO');
  await wait(900);
  let panelText = document.body.innerText;
  let panelOpen = panelText.includes('PANEL DEL ADMINISTRADOR');
  if (!panelOpen) {
    // reintento (el setInterval de 60ms del combo puede ir lento)
    press('KeyU'); press('KeyI'); press('KeyO');
    await wait(900);
    release('KeyU'); release('KeyI'); release('KeyO');
    await wait(1200);
    panelText = document.body.innerText;
    panelOpen = panelText.includes('PANEL DEL ADMINISTRADOR');
  }
  check('Panel admin abre con U+I+O', panelOpen);
  if (panelOpen) {
    check('Sección VER CINEMÁTICAS', panelText.includes('VER CINEMÁTICAS'));
    check('Sin texto CIERRA CON U+I+O', !panelText.includes('CIERRA CON U+I+O'));
    const cineBtns = Array.from(document.querySelectorAll('button')).filter((b) => b.textContent && /Introducción|Hito|Victoria|FINAL/.test(b.textContent));
    check('Botones de cinemáticas (>= 9)', cineBtns.length >= 9, `${cineBtns.length}`);

    mark('intro-play');
    const introBtn = cineBtns.find((b) => b.textContent.includes('Introducción'));
    check('Botón de intro', !!introBtn);
    if (introBtn) {
      introBtn.click();
      await wait(4000);
      check('Intro reproduciéndose', g.cinematics.active);
      check('Narración visible (texto Eldoria)', document.body.innerText.includes('Eldoria'));
      check('Letterbox cinematográfico', !!document.querySelector('.kotfs-cine-bar'));
      press('Space'); release('Space');
      await wait(1500);
      check('Intro saltable', !g.cinematics.active);
    }

    mark('final-play');
    // reabrir panel
    press('KeyU'); press('KeyI'); press('KeyO');
    await wait(700);
    release('KeyU'); release('KeyI'); release('KeyO');
    await wait(1400);
    const finalBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('FINAL I'));
    check('Botón FINAL I', !!finalBtn);
    if (finalBtn) {
      finalBtn.click();
      await wait(5000);
      check('FINAL I en marcha (preview)', g.endings.isPlaying);
      await wait(10000);
      const card = g.endings.active;
      check('Final LARGO: 9 planos', card && card.shots.length === 9, `${card ? card.shots.length : 0}`);
      const totalDur = card ? card.shots.reduce((a, s) => a + s.dur, 0) : 0;
      check('Duración épica ~90 s', totalDur >= 80, `${totalDur}s`);
      check('Cámara FOV por plano', card && card.shots.some((s) => s.fov !== undefined));
      const bodyEnd = document.body.innerText;
      check('Carta del final en pantalla', bodyEnd.includes('EL GUARDIÁN DE LA MAREA') || bodyEnd.includes('Final I'));
      check('Preview NO sella ending_done', !g.state.hasFlag('ending_done'));
      // la carta avanza (progress > 0)
      const progText = document.querySelector('.kotfs-letterbox');
      check('Overlay del final (letterbox)', !!progText);
      g.endings.skip();
      await wait(1200);
      check('Final saltable', !g.endings.isPlaying);
    }
  }

  // hito de capítulo por API (fuerza replay)
  mark('chapter');
  const okCh = g.adminPlayCinematic ? g.adminPlayCinematic('cap3') : false;
  await wait(3500);
  check('Hito de capítulo reproducible', okCh && g.cinematics.active);
  press('Space'); release('Space');
  await wait(1200);
  check('Hito saltable', !g.cinematics.active);

  // victoria genérica
  const okV = g.adminPlayCinematic ? g.adminPlayCinematic('victoria') : false;
  await wait(3000);
  check('Victoria genérica reproducible', okV && g.cinematics.active);
  check('Cartela LA LEYENDA DEL CABALLERO', document.body.innerText.includes('LA LEYENDA DEL CABALLERO'));
  press('Space'); release('Space');
  await wait(1200);

  window.__kotfsE2ELogE = log;
  mark('done');
  return 'done';
  } catch (e) {
    const log = window.__kotfsE2ELogE || [];
    log.push('FAIL — EXCEPCION: ' + e.message);
    window.__kotfsE2ELogE = log;
    window.__f10e = 'error';
    return 'error';
  }
})()
