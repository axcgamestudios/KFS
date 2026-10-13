// Screenshots the KFS complete-map cartography page into the final PNG.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--force-color-profile=srgb', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 2320, height: 2560 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('file:///home/z/my-project/scripts/map_page.html', { waitUntil: 'networkidle' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 90000 });
  // One extra paint beat for the 500ms-async font swap
  await page.waitForTimeout(700);

  await page.screenshot({
    path: '/home/z/my-project/download/kfs_mapa_completo.png',
    clip: { x: 0, y: 0, width: 2320, height: 2560 },
  });

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  console.log('DONE -> /home/z/my-project/download/kfs_mapa_completo.png');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
