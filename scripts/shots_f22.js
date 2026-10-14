// shots_f22.js — UI-free scenic QA shots for VLM verification:
// the three stations, Sister Ysolt, the two legends, the eclipse sky, the
// knight's cape at a run. Each teleport waits for a rendered frame
// (requestAnimationFrame settle) at SwiftShader pace.
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8899/KFS/';
const OUT = '/home/z/my-project/scripts/shots_f22';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=2600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'medium', tier: 'medium', settingsRev: 3, waves: true, shadows: false,
        realLights: false, grass3d: true, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.7, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
    } catch (e) { /* ignore */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') break;
      await wait(500);
    }
    await wait(20000);
  });

  // shots: [file, tx, tz, yaw] — teleport near each subject and aim the
  // follow camera at it (yaw faces the subject from the player's spot)
  const shots = [
    ['anvil', 49.5, 169, Math.atan2(45 - 49.5, 166 - 169)],
    ['altar', -144, -263, Math.atan2(-148 - -144, -268 - -263)],
    ['titans', 32, -286, Math.atan2(26 - 32, -292 - -286)],
    ['ysolt', 163.5, 283, Math.atan2(160 - 163.5, 280 - 283)],
    ['king', -531, -450, Math.atan2(-536 - -531, -455 - -450)],
    ['ronin', -7, 620, Math.atan2(-12 - -7, 616 - 620)],
  ];
  for (const [name, x, z, yaw] of shots) {
    await page.evaluate(async (x, z, yaw) => {
      const g = window.__kotfsGame;
      g.player.teleport(x, g.world.terrainHeight.height(x, z), z);
      g.rig.yaw = yaw;
      g.rig.pitch = 0.18;
    }, x, z, yaw).catch(() => {});
    // wait for frames to settle at SwiftShader pace
    await page.waitForTimeout(17000);
    await page.screenshot({ path: `${OUT}/f22_${name}.png`, timeout: 120000 });
    console.log('shot', name);
  }

  // the eclipse sky: summon + wait for the ramp, shot from the village
  await page.evaluate(async () => {
    const g = window.__kotfsGame;
    g.state.addItem('esencia_solar', 1);
    g.forge.summonEclipse();
    g.world.sky.dayFraction = 0.5; // high noon for the full ring-of-fire read
  }).catch(() => {});
  await page.waitForTimeout(26000);
  await page.screenshot({ path: `${OUT}/f22_eclipse.png`, timeout: 120000 });
  console.log('shot eclipse');

  await browser.close();
})();
