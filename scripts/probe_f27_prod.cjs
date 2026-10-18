const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  page.on('console', m => { const t = m.text(); if (/error|fail/i.test(t)) console.log('[console]', t.slice(0, 140)); });
  await page.goto('http://localhost:8901/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => ({
      btns: Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '').slice(0, 6),
      game: !!window.__kotfsGame,
      api: !!window.__kotfsApi,
    })).catch(e => ({ err: String(e).slice(0, 100) }));
    console.log(i, JSON.stringify(s).slice(0, 200));
    if (s.game) break;
    await page.waitForTimeout(2000);
  }
  await browser.close();
})();
