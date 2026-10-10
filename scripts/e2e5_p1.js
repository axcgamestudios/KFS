(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = window.__kotfsE2ELog || (window.__kotfsE2ELog = []);
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  // menu render
  let btn = null;
  for (let i = 0; i < 20; i++) {
    btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) break;
    await wait(400);
  }
  check('Menú con botón Nueva partida', !!btn);
  check('Menú Fase 5 v0.5', document.body.textContent.includes('v0.5'));
  check('Marca AXCGames Studios', document.body.textContent.toUpperCase().includes('AXCGAMES STUDIOS'));
  const img = document.querySelector('img[src*="menu_bg"]');
  check('Imagen de fondo del menú (galeón)', !!img, img ? img.getAttribute('src') : 'no img');
  let imgOk = false;
  try { imgOk = img && img.complete && img.naturalWidth > 800; } catch { imgOk = false; }
  check('Imagen cargada (naturalWidth>800)', !!imgOk, imgOk ? `${img.naturalWidth}x${img.naturalHeight}` : '');
  const noDomTitle = !Array.from(document.querySelectorAll('h1')).some((h) => h.textContent.includes('FORGOTTEN'));
  check('Sin título DOM (ya vive en la imagen)', noDomTitle);
  check('Botones estilo kfs2', !!document.querySelector('.kfs2-btn'));
  const prim = document.querySelector('.kfs2-btn-primary');
  check('Botón primario dorado', !!prim);
  window.__kotfsMenuReady = !!btn;
  return log.join('\n');
})().catch((e) => 'ERROR ' + e);