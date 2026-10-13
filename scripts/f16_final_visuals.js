// Final visual evidence: (1) loading screen without the big title text,
// (2) Borin's dwarf forge (gold roof, stone skirt, white concrete).
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 1) loading screen DURING boot (before the menu paints over it)
  await page.waitForTimeout(2200);
  await page.screenshot({ path: '/home/z/my-project/download/capturas/f16_carga.png' });
  console.log('shot -> f16_carga.png (loading screen)');
  // 2) wait for the menu, start a game, jump to Borin's forge
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => !!window.__kotfsGame && !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA')))) break;
  }
  await page.evaluate(() => {
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    btn.click();
  });
  await page.waitForTimeout(2600);
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const g = window.__kotfsGame;
    const p = g.player;
    p.teleport(-114, g.world.terrainHeight.height(-114, -54) + 0.5, -54);
    (window.__kotfsApi || g).adminSetTime(0.45);
  });
  await page.waitForTimeout(2800);
  await page.screenshot({ path: '/home/z/my-project/download/capturas/f16_forja_enano.png' });
  console.log('shot -> f16_forja_enano.png (dwarf forge)');
  await browser.close();
})();
