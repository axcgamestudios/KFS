// debug_raf.js — is the engine loop alive during 'playing'?
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8899/KFS/';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=2600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 3, reflections: 0,
        postfx: false, resolution: 0.5, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) { /* ignore */ }
  });
  page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSERR:', m.text().slice(0, 300)); });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const out = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    // 1) raw rAF alive?
    const rafAlive = await Promise.race([
      new Promise((r) => requestAnimationFrame(() => r(true))),
      wait(3000).then(() => false),
    ]);
    // 2) rAF DURING menu
    const g = window.__kotfsGame;
    // 3) start the game
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    let playingAt = -1;
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') { playingAt = i; break; }
      await wait(500);
    }
    // wait LONG (boot pregeneration can take a while under swiftshader)
    const phases = [];
    let lastT = -1;
    let stable = 0;
    for (let i = 0; i < 60; i++) {
      await wait(500);
      const s = window.__kotfsStoreGet();
      const t = g.player.model.t;
      phases.push(`${s.phase[0]}${s.overlay ? 'O' : ''}:${t?.toFixed(2)}`);
      if (t === lastT) stable++; else { stable = 0; lastT = t; }
      if (stable > 6 && i > 10) break;
    }
    // 4) rAF after playing
    const rafAfter = await Promise.race([
      new Promise((r) => requestAnimationFrame(() => r(true))),
      wait(3000).then(() => false),
    ]);
    const rafAfter2 = await Promise.race([
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))),
      wait(3000).then(() => false),
    ]);
    return { rafAlive, playingAt, phases, rafAfter, rafAfter2, t: lastT };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
