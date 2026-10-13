// Minimal F17 boot diagnostic — find where/why the page dies.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=500',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('crash', () => errors.push('RENDERER CRASH'));
  page.on('close', () => errors.push('PAGE CLOSED'));
  await page.addInitScript(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('kotfs_settings') || '{}');
      raw.tier = 'xlow'; raw.quality = 'xlow'; raw.settingsRev = 3;
      Object.assign(raw, {
        waves: false, shadows: false, realLights: false, grass3d: false,
        reflections: 0, postfx: false, resolution: 0.5, renderChunks: 2, showFps: false,
      });
      localStorage.setItem('kotfs_settings', JSON.stringify(raw));
    } catch { /* ignore */ }
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('goto ok');
  await page.bringToFront().catch(() => {});
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(2000).catch(() => {});
    const st = await page.evaluate(() => {
      const g = window.__kotfsGame;
      const mem = performance.memory ? {
        used: Math.round(performance.memory.usedJSHeapSize / 1e6),
        total: Math.round(performance.memory.totalJSHeapSize / 1e6),
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1e6),
      } : null;
      const store = window.__kotfsStoreGet ? window.__kotfsStoreGet() : null;
      return {
        alive: true,
        phase: store ? store.phase : 'no-store',
        hasGame: !!g,
        progress: store ? store.loadProgress : -1,
        label: store ? store.loadLabel : '',
        mem,
        notif: store && store.notifications.length ? store.notifications[store.notifications.length - 1].title : '',
        btns: Array.from(document.querySelectorAll('button')).map((b) => b.textContent).slice(0, 4),
      };
    }).catch(() => null);
    if (!st) { console.log(`t=${i * 2}s: PAGE UNREACHABLE. errors:`, errors.slice(-6)); break; }
    console.log(`t=${i * 2}s: phase=${st.phase} prog=${(st.progress * 100).toFixed(0)}% mem=${st.mem ? st.mem.used + '/' + st.mem.total + 'MB' : '?'} label="${st.label}" notif="${st.notif}"`);
    if (st.phase === 'menu' && i === 2) {
      // press NEW GAME through the real UI
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').toUpperCase().includes('NEW GAME'));
        if (btn) btn.click();
      });
      console.log('clicked NEW GAME');
    }
    if (st.phase === 'intro' && i > 3) {
      await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })); });
    }
    if (st.phase === 'playing') {
      await page.screenshot({ path: '/home/z/my-project/download/capturas/f17_diag_playing.png' }).catch(() => {});
      console.log('PLAYING reached at t=' + i * 2 + 's — waiting 30 more seconds to watch stability...');
      for (let k = 0; k < 15; k++) {
        await page.waitForTimeout(2000).catch(() => {});
        const st2 = await page.evaluate(() => {
          const store = window.__kotfsStoreGet ? window.__kotfsStoreGet() : null;
          const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1;
          return { phase: store ? store.phase : '?', mem, hp: store ? Math.round(store.health) : -1 };
        }).catch(() => null);
        if (!st2) { console.log(`  +${k * 2}s: DIED. errors:`, errors.slice(-6)); break; }
        console.log(`  +${k * 2}s: phase=${st2.phase} hp=${st2.hp} mem=${st2.mem}MB`);
      }
      break;
    }
  }
  console.log('FINAL ERRORS:', errors.slice(0, 10));
  await browser.close().catch(() => {});
})().catch((e) => console.log('FATAL:', e.message));
