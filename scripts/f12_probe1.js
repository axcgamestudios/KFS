const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  // wait for the game object
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(2000);
    const started = await page.evaluate(() => !!window.__kotfsGame);
    if (started) break;
  }
  const info = await page.evaluate(() => {
    const g = window.__kotfsGame;
    if (!g) return { booted: false, text: document.body.innerText.slice(0, 200) };
    return { booted: true, phase: document.body.innerText.includes('NUEVA PARTIDA') ? 'menu' : 'ingame' };
  });
  console.log(JSON.stringify(info));
  console.log('errors:', errors.slice(0, 5));
  await browser.close();
})();
