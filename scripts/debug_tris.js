// debug_tris.js — WHERE do 3.4M triangles live? Per-root-object audit.
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
    } catch (e) { /* ignore */ }
  });
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
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') break;
      await wait(500);
    }
    await wait(8000);
    // per-ROOT audit: name the top-level scene children by triangle count
    const audit = [];
    const trisOf = (o) => {
      let t = 0;
      o.traverse((c) => {
        if (c.isMesh || c.isSkinnedMesh) {
          const geo = c.geometry;
          t += (geo.index ? geo.index.count : (geo.attributes.position ? geo.attributes.position.count : 0)) / 3;
        }
      });
      return t;
    };
    for (const child of g.engine.scene.children) {
      const t = trisOf(child);
      if (t > 1000) audit.push({ name: child.name || child.type, type: child.type, tris: Math.round(t), visible: child.visible });
    }
    audit.sort((a, b) => b.tris - a.tris);
    const total = audit.reduce((a, b) => a + b.tris, 0);
    return { total: Math.round(total), top: audit.slice(0, 18) };
  }).catch((e) => ({ evalErr: String(e).slice(0, 300) }));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
