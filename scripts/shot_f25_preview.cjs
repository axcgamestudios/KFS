// shot_f25_preview.cjs — render preview shots of the new uploaded models
// node scripts/shot_f25_preview.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f25';
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  // armour (character) — 4 angles
  ['armour_front', 'armour', 25, 8], ['armour_back', 'armour', 155, 8],
  ['armour_side', 'armour', 90, 5], ['armour_3q', 'armour', 40, 25],
  ['armour_above', 'armour', 45, 55],
  // sword — 3 angles
  ['sword_front', 'sword', 20, 5], ['sword_side', 'sword', 90, 5], ['sword_3q', 'sword', 45, 30],
  // bow — 3 angles
  ['bow_front', 'bow', 20, 5], ['bow_side', 'bow', 90, 5], ['bow_3q', 'bow', 45, 30],
];

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1400',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
  ] });
  for (const [name, model, a, e] of SHOTS) {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    page.on('pageerror', ev => console.log('[pageerror]', String(ev).slice(0, 200)));
    try {
      await page.goto(`http://localhost:3000/f25_preview.html?m=${model}&a=${a}&e=${e}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction('window.__previewReady === true', { timeout: 30000 });
      await page.waitForFunction('window.__frame > 12', { timeout: 60000 });
      await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 120000 });
      const label = await page.evaluate(() => document.getElementById('label').textContent);
      console.log('shot:', name, '|', label);
    } catch (err) {
      console.log('FAIL:', name, String(err).slice(0, 150));
    }
    await page.close();
  }
  await browser.close();
  console.log('ALL DONE');
})().catch(e => { console.error(e); process.exit(1); });
