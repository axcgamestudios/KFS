// probe_f25_menu.cjs — DOM-level test of the How to Play flow
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage', '--mute-audio',
  ] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 60; i++) {
    const has = await page.evaluate(() =>
      !!Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('How to Play'))).catch(() => false);
    if (has) break;
    await page.waitForTimeout(500);
  }
  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim()));
  console.log('menu buttons:', JSON.stringify(btns));

  // click How to Play via DOM (the sheen animation makes Playwright's
  // actionability wait forever)
  const clicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === 'How to Play');
    if (!b) return false;
    b.click();
    return true;
  });
  console.log('clicked:', clicked);
  await page.waitForTimeout(1500);
  const panel = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      hasHowToHeader: t.includes('HOW TO PLAY'),
      hasMovement: t.includes('Movement'),
      hasMelee: t.includes('Melee Combat'),
      hasBowCat: t.includes('The Bow'),
      hasSailing: t.includes('Sailing'),
      hasKeyChips: document.querySelectorAll('.kfs2-key').length,
      hasFirstPersonRow: t.includes('First person'),
      hasBack: !!Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Back')),
    };
  });
  console.log('panel state:', JSON.stringify(panel));
  await page.screenshot({ path: '/home/z/my-project/scripts/shots_f25/howto2.png', timeout: 60000 });
  // Back returns to the menu
  const back = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === 'Back');
    if (!b) return { back: false };
    b.click();
    return { back: true };
  });
  await page.waitForTimeout(900);
  const backState = await page.evaluate(() => {
    const t = document.body.innerText;
    return { menuBack: t.includes('NEW GAME'), panelGone: !t.includes('Melee Combat') };
  });
  console.log('back state:', JSON.stringify(back), JSON.stringify(backState));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
