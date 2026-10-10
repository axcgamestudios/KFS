(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = window.__kotfsE2ELog || (window.__kotfsE2ELog = []);
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  const g = window.__kotfsGame;
  const state = () => g.state;
  const active = state().currentTracker?.title === 'El Legado de Eirik';
  if (!active) {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn && !window.__kotfsStarted) { btn.click(); window.__kotfsStarted = true; }
  }
  for (let i = 0; i < 5; i++) {
    if (state().currentTracker?.title === 'El Legado de Eirik') break;
    await wait(800);
  }
  const ready = state().currentTracker?.title === 'El Legado de Eirik';
  if (!ready) {
    // intro cinematic may be playing — skip it
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
    await wait(900);
  }
  check('Q1 activa tras intro', state().currentTracker?.title === 'El Legado de Eirik', state().currentTracker?.title ?? 'none');
  window.__kotfsE2ELog = log;
  return ready ? 'BOOT OK' : 'BOOT PENDING — re-run this script';
})().catch((e) => 'ERROR ' + e);