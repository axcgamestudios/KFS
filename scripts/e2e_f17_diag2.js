// Quick diagnostic: weapon state + aimed combat internals.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=600',
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const result = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
    const release = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true }));
    const log = [];
    const check = (name, cond, extra = '') => log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`);
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 120; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') break;
      await wait(500);
    }
    await wait(2000);

    const c = g.combat, p = g.player;
    log.push(`weapon id: ${g.state.equippedWeapon}`);
    log.push(`weapon def: ${c.weapon ? c.weapon.id + ' reach=' + c.weapon.reach + ' arc=' + c.weapon.arc : 'NULL'}`);
    log.push(`valor0: ${c.valorValue}`);

    // give a sword if bare-handed, to test both ways
    if (!c.weapon) {
      g.state.addItem('espada', 1);
      g.state.equip('espada');
      log.push(`after equip: ${c.weapon ? c.weapon.id : 'still null'}`);
    }

    // arena setup
    const th = g.world.terrainHeight;
    p.teleport(150, th.height(150, 120) + 0.05, 120);
    await wait(400);
    for (const b of g.bandits.bandits) { b.aggro = false; b.state = 'patrol'; b.attackT = 0; }
    const victim = g.bandits.bandits.find((b) => !b.dead && b.role === 'thief');
    const place = (dist) => {
      const x = 150 + dist, z = 120;
      victim.pos.set(x, th.height(x, z), z);
      victim.yaw = Math.atan2(150 - x, 120 - z);
      victim.aggro = false; victim.state = 'hold'; victim.attackT = 0;
      victim.knockdownT = 0; victim.backTurnedT = 0; victim.airborne = false;
      victim.hp = Math.max(victim.hp, 60);
      // AIM the player at the victim
      p.yaw = Math.atan2(x - p.position.x, z - p.position.z);
      p.attackT = 0; p.attackRecovery = 0; p.dashing = false;
      c.comboStep = 0; c.comboWindowT = 0; c.hookCd = 0; c.grappleCd = 0;
      c.swingHitDone = false;
    };

    // ---- 1) spin knockdown, AIMED ----
    place(1.5);
    p.attackKind = 'spin'; c.swingIsMulti = true;
    const hp0 = victim.hp;
    c.resolveMeleeHit(c.weapon, true);
    check('SPIN (aimed) damages + knocks down', victim.knockdownT > 0 && victim.hp < hp0,
      `kd=${victim.knockdownT?.toFixed(2)} hp ${hp0.toFixed(0)}→${victim.hp.toFixed(0)}`);

    // ---- 2) hook dash, stepped ----
    place(4.0); // a bit further so the dash actually travels
    const hp1 = victim.hp;
    c.beginHookDash({ bandit: victim, point: victim.pos.clone() });
    let steps = 0;
    for (let i = 0; i < 40 && p.dashing; i++) { c.updateHookDash(1 / 60); steps++; }
    check('HOOK DASH connects (vault window + kick damage)',
      c.vaultWindowT > 0 && victim.hp < hp1,
      `steps=${steps} vault=${c.vaultWindowT?.toFixed(2)} hp ${hp1.toFixed(0)}→${victim.hp.toFixed(0)}`);

    // ---- 3) rope dart, stepped ----
    place(6.0);
    c.vaultWindowT = 0; p.dashing = false; c.hookDashTarget = null;
    const x0 = victim.pos.x, hp2 = victim.hp;
    c.grappleCd = 0; p.attackT = 0;
    c.fireGrappleShot(c.weapon);
    let gsteps = 0;
    for (let i = 0; i < 200 && c.grapple; i++) { c.updateGrapple(1 / 60); gsteps++; }
    const moved = Math.abs(victim.pos.x - x0);
    check('ROPE DART yanks him in',
      moved > 0.7 || victim.airborne || victim.knockdownT > 0 || victim.state === 'stagger' || victim.hp < hp2,
      `steps=${gsteps} moved=${moved.toFixed(2)} kd=${victim.knockdownT?.toFixed(2)} st=${victim.state} hp ${hp2.toFixed(0)}→${victim.hp.toFixed(0)}`);

    // ---- 4) air bounce via the input branch (real keydown) ----
    place(2.0);
    victim.airborne = true; victim.state = 'juggle';
    p.grounded = false; p.verticalVel = -0.5; p.airTime = 0.2; p.jumpsUsed = 1;
    p.attackT = 0; p.rolling = false; p.dashing = false; p.plunging = false; p.stamina = 100;
    c.airJuggleUsed = 2;
    press('KeyC');
    await wait(120);
    release('KeyC');
    await wait(300);
    check('AIR BOUNCE vaults the hero (vy > 4)', p.verticalVel > 4, `vy=${p.verticalVel.toFixed(1)} juggle=${c.airJuggleUsed}`);
    check('Bounce refreshes the air juggle', c.airJuggleUsed === 0, `used=${c.airJuggleUsed}`);

    const pass = log.filter((l) => l.startsWith('PASS')).length;
    const fail = log.filter((l) => l.startsWith('FAIL')).length;
    log.push(`DONE — ${pass} PASS / ${fail} FAIL`);
    return log;
  }).catch((e) => ['EXCEPTION: ' + e.message + ' | ' + String(e.stack).split('\n').slice(0, 3).join(' | ')]);

  console.log('\n===== DIAG LOG =====\n' + result.join('\n'));
  console.log('\nPAGE ERRORS: ' + (errors.length ? errors.join('\n') : 'none'));
  await browser.close().catch(() => {});
  process.exit(0);
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
