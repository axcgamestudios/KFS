// shot_statue.cjs — render statue_viewer.html from several angles, one process per shot
// Usage: node shot_statue.cjs <m=model.glb> <a=azimuth> <e=elev> <r=radius> <ty=targetY> <pose> <hide> <out.png>
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).map(s => {
  const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)];
}));

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
  ] });
  const page = await browser.newPage({ viewport: { width: 820, height: 940 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  const q = new URLSearchParams({
    m: args.m || 'knight_statue.glb',
    a: args.a || '25', e: args.e || '10', r: args.r || '3.4',
    ty: args.ty || '0.9', pose: args.pose || 'bind', hide: args.hide || 'none',
  });
  await page.goto(`http://localhost:8899/scripts/statue_viewer.html?${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 120; i++) {
    const ok = await page.evaluate(() => window.__shot === true).catch(() => false);
    if (ok) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: args.out || '/home/z/my-project/scripts/statue_shot.png' });
  await browser.close();
  console.log('shot saved:', args.out || 'statue_shot.png');
})();
