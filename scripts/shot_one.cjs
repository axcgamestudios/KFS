// shot_one.cjs — bulletproof single-screenshot runner:
// node shot_one.cjs <name> <camX> <camZ> <lift> <tx> <ty> <tz> [knight]
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f23';
const args = process.argv.slice(2);
const [name, camX, camZ, lift, tx, ty, tz] = args;
const withKnight = args[7] === 'knight';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1400',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  page.on('crash', () => console.log('[CRASH] renderer crashed'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 2, reflections: 0,
        postfx: false, resolution: 0.65, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.exposeFunction('saveShot', async (n) => {
    await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 150000 });
    console.log('shot saved:', n);
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async (cfg) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__kotfsGame;
    if (!g) return 'no game';
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true }));
      }
      if (ph === 'playing') break;
      await wait(500);
    }
    await wait(11000);
    if (cfg.knight) {
      g.state.addItem('espada_acero', 1);
      g.state.equip('espada_acero');
      g.player.position.set(24.5, g.world.terrainHeight.height(24.5, 154.5) + 0.1, 154.5);
      g.player.velocity.set(0, 0, 0);
      await wait(1600);
    }
    const H = (x, z) => g.world.terrainHeight.height(x, z);
    const ty = H(cfg.tx, cfg.tz) + cfg.tOff;   // target height = terrain + offset
    const camY = Math.max(H(cfg.camX, cfg.camZ), ty) + cfg.lift;
    g.rig.freeCam = true;
    g.rig.freePos.set(cfg.camX, camY, cfg.camZ);
    g.rig.yaw = Math.atan2(cfg.tx - cfg.camX, cfg.tz - cfg.camZ);
    g.rig.pitch = Math.atan2(ty - camY, Math.hypot(cfg.tx - cfg.camX, cfg.tz - cfg.camZ));
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    await wait(700);
    const canvas = document.querySelector('canvas');
    for (const el of document.querySelectorAll('body *')) {
      if (el !== canvas && !canvas.contains(el) && !el.contains(canvas) &&
          el.style.display !== 'none' && !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(el.tagName)) {
        el.style.display = 'none';
      }
    }
    await wait(300);
    await window.saveShot(cfg.name);
    return 'ok';
  }, {
    name, camX: +camX, camZ: +camZ, lift: +lift, tx: +tx, tOff: +ty, tz: +tz, knight: withKnight,
  }).catch(e => 'EVAL-DEAD: ' + String(e).slice(0, 120));
  console.log('result:', r);
  await browser.close();
})().catch(e => { console.error('CRASH', String(e).slice(0, 200)); process.exit(2); });
