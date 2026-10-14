const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--expose-gc --max-old-space-size=2600','--disable-dev-shm-usage','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('console', m => console.log('[console]', m.text().slice(0, 200)));
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(2500);
    const s = await page.evaluate(() => ({
      phase: window.__kotfsStoreGet?.()?.phase ?? 'no-store',
      game: !!window.__kotfsGame,
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.toUpperCase()).slice(0, 6),
    })).catch(e => ({ err: String(e).slice(0, 100) }));
    console.log(i, JSON.stringify(s));
    if (s.phase === 'playing' || (s.buttons && s.buttons.some(t => t && t.includes('NEW GAME')))) break;
  }
  await browser.close();
})();
