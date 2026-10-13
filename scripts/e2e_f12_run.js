// Launcher: opens the game, injects e2e_fase12.js, polls results
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 768 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const script = require('fs').readFileSync('/home/z/my-project/scripts/e2e_fase12.js', 'utf8');
  await page.evaluate(script);
  // poll for results up to 150s
  let result = null;
  for (let i = 0; i < 150; i++) {
    await page.waitForTimeout(1000);
    result = await page.evaluate(() => ({
      log: window.__kotfsE2EF12Log,
      step: window.__e2eStepF12,
      err: window.__e2eErrF12,
    }));
    if (result.log) break;
  }
  console.log('=== STEP:', result?.step, '===');
  console.log(result?.log ? result.log.join('\n') : 'NO RESULT (timeout)');
  if (result?.err) console.log('RUNTIME ERROR:', result.err);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 12).join('\n'));
  await page.screenshot({ path: '/home/z/my-project/download/capturas/f12_e2e.png' });
  await browser.close();
})();
