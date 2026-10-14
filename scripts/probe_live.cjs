const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--expose-gc --max-old-space-size=2600','--disable-dev-shm-usage','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  page.on('requestfailed', r => console.log('[reqfail]', r.url().slice(-80), r.failure()?.errorText));
  page.on('response', r => { if (r.status() >= 400) console.log('[http', r.status() + ']', r.url().slice(-90)); });
  await page.addInitScript(() => { try { localStorage.setItem('kfs_test_playwright', '1'); } catch (e) {} });
  await page.goto('https://axcgamestudios.github.io/KFS/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(2000); const b = await page.evaluate(() => !!window.__kotfsApi); if (b) break; }
  console.log('api?', await page.evaluate(() => !!window.__kotfsApi));
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 30; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true })); }
      if (ph === 'playing') return 'playing after ' + i;
      await wait(1000);
    }
    return 'phase=' + window.__kotfsStoreGet().phase;
  });
  console.log('result:', r);
  await browser.close();
})();
