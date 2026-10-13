// F17 boot probe — capture 404s + verify sea systems are wired + quick combat sanity.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=600',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(-90)}`); });
  page.on('pageerror', (e) => bad.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // wait for the menu
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const result = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const log = [];
    const check = (name, cond, extra = '') => log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`);
    const g = window.__kotfsGame;
    if (!g) { log.push('FAIL — no game instance'); return log; }
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;

    // new game + skip intro
    window.__kotfsApi.startNewGame();
    let playing = false;
    for (let i = 0; i < 120; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') { playing = true; break; }
      await wait(500);
    }
    check('Boots to PLAYING', playing);
    if (!playing) return log;
    await wait(2500);

    // ---- SEA SYSTEMS wired ----
    check('SeaBeastSystem instantiated', !!g.seaBeasts);
    check('PirateAmbushSystem instantiated', !!g.pirateAmbush);
    check('Naval wire: seaBeasts linked', g.naval.seaBeasts === g.seaBeasts);
    check('Navel island terrain bump exists', g.world.terrainHeight.height(476, 476) > 4,
      `h=${g.world.terrainHeight.height(476, 476).toFixed(1)}`);
    check('Horn altar interactable registered',
      g.world.interactables.some((it) => it.id === 'horn_altar'));
    const altar = g.world.interactables.find((it) => it.id === 'horn_altar');
    check('Altar prompt (no horn yet)', altar && /horn/i.test(altar.prompt), `"${altar?.prompt}"`);

    // ---- items + dialogues merged ----
    const api = window.__kotfsApi;
    g.state.addItem('cuerno_marea', 1);
    check('Tide Horn item exists (F15 items merged)', api.inventory().some((i) => i.id === 'cuerno_marea'));
    while (g.state.level < 6) g.state.giveXp(1);
    check('Altar prompt turns actionable with horn + level 6',
      altar && /sound the tide horn/i.test(altar.prompt), `"${altar?.prompt}"`);

    // ---- summon the King (deterministic prereqs) ----
    const summoned = g.seaBeasts.summonKing();
    check('The King of the Sea answers the horn', summoned);
    await wait(1200);
    check('King is alive in the arena', g.seaBeasts.beasts.some((b) => b.alive && b.isKing));
    check('King fight state active', g.seaBeasts.kingFightActive === true);
    // the King WAITS while the summoner is ashore (Fase 17 fix)
    await wait(2500);
    check('King still waits after 3.7s ashore (boss does not despawn)',
      g.seaBeasts.kingFightActive === true && g.seaBeasts.beasts.some((b) => b.alive && b.isKing));

    // ---- deterministic combat internals: spin knockdown + hook dash ----
    // (the live loop at SwiftShader fps eats sub-second windows, so the
    //  internals are stepped directly — same trick as the parry probes)
    g.seaBeasts.resetCombat();
    const victim = g.bandits.bandits.find((b) => !b.dead && b.role === 'thief');
    const c = g.combat, p = g.player;
    const th = g.world.terrainHeight;
    p.teleport(150, th.height(150, 120) + 0.05, 120);
    victim.pos.set(150 + 1.4, th.height(151.4, 120), 120);
    victim.aggro = false; victim.state = 'hold'; victim.hp = Math.max(victim.hp, 60);
    // spin: multi sweep knocks down
    p.attackKind = 'spin'; c.swingIsMulti = true; c.swingHitDone = false;
    p.yaw = Math.atan2(victim.pos.x - p.position.x, victim.pos.z - p.position.z);
    const hpBefore = victim.hp;
    c.resolveMeleeHit(c.weapon, true);
    check('WHIRLWIND knocks the thief down', victim.knockdownT > 0, `kd=${victim.knockdownT?.toFixed(2)}`);
    // hook dash: begins + connects within its window when stepped at 60fps
    victim.knockdownT = 0; victim.state = 'hold';
    const hpBefore2 = victim.hp;
    c.hookCd = 0; p.stamina = 100; p.dashing = false;
    victim.pos.set(154, p.position.y, 120); // flat-line placement: pure dash test
    c.beginHookDash({ bandit: victim, point: victim.pos.clone() });
    check('Hook dash begins', p.dashing === true);
    // step at LOW-fps dt (0.4s) WITH position integration, like Player.update
    let lowFpsImpact = false;
    for (let i = 0; i < 12 && p.dashing; i++) {
      c.updateHookDash(0.4);
      p.position.x += p.velocity.x * 0.4;
      p.position.z += p.velocity.z * 0.4;
      if (c.vaultWindowT > 0) { lowFpsImpact = true; break; }
    }
    check('Hook dash CONNECTS even at 2.5 FPS (clamped)',
      lowFpsImpact && victim.hp < hpBefore2,
      `vault=${c.vaultWindowT?.toFixed(2)} hp ${hpBefore2.toFixed(0)}→${victim.hp.toFixed(0)}`);
    // rope dart: fire + step the yank (aim the dart along the victim:
    // monkey-patch the camera ray — in the real game the player AIMS)
    c.vaultWindowT = 0; p.dashing = false; c.hookDashTarget = null;
    victim.state = 'hold'; victim.airborne = false; victim.knockdownT = 0;
    victim.pos.set(156, th.height(156, 120), 120);
    const V = Object.getPrototypeOf(g.player.position).constructor;
    const aimOrig = new V(p.position.x, p.position.y + 1.5, p.position.z);
    const aimDir = new V(victim.pos.x - aimOrig.x, (victim.pos.y + 1.0) - aimOrig.y, victim.pos.z - aimOrig.z).normalize();
    c.hooks.aimRay = () => ({ origin: aimOrig, dir: aimDir });
    const x0 = victim.pos.x;
    c.grappleCd = 0; p.attackT = 0; p.yaw = Math.atan2(victim.pos.x - p.position.x, victim.pos.z - p.position.z);
    c.fireGrappleShot(c.weapon);
    check('Rope dart fires', !!c.grapple);
    for (let i = 0; i < 120 && c.grapple; i++) c.updateGrapple(1 / 60);
    const moved = Math.abs(victim.pos.x - x0);
    check('The dart YANKS him off his feet',
      moved > 0.7 || victim.airborne || victim.knockdownT > 0 || victim.state === 'stagger',
      `moved=${moved.toFixed(2)} kd=${victim.knockdownT?.toFixed(2)} st=${victim.state}`);

    // ---- Elin's sea-trade dialogue hub (requires-gated options) ----
    g.state.addItem('escama_abismo', 2);
    const dlgOk = g.dialogue.start('elin');
    const st = window.__kotfsStoreGet();
    const opts = st.dialogue ? st.dialogue.options.map((o) => o.text) : [];
    check('Elin opens the sea-trade hub', dlgOk && opts.length > 0);
    check('Trade option requires 2 scales (visible with them)',
      opts.some((t) => /trade 2 scales/i.test(t)), opts.slice(0, 3).join(' | '));
    g.dialogue.close();

    // ---- pirate negotiation UI plumbing ----
    g.pirateAmbush.ambushActive = true;
    const opened = g.pirateAmbush.notifyPlayerDeath();
    check('Pirate toll negotiation deploys on death', opened === true);
    const nego = window.__kotfsStoreGet().negotiation;
    check('Negotiation state reaches the store', !!nego && nego.reason === 'death', JSON.stringify(nego)?.slice(0, 60));
    window.__kotfsApi.negotiateChoice('mercy');
    check('Negotiation resolves via the API', window.__kotfsStoreGet().negotiation === null);

    const pass = log.filter((l) => l.startsWith('PASS')).length;
    const fail = log.filter((l) => l.startsWith('FAIL')).length;
    log.push(`DONE — ${pass} PASS / ${fail} FAIL`);
    return log;
  }).catch((e) => ['EXCEPTION: ' + e.message]);

  console.log('\n===== PROBE LOG =====\n' + result.join('\n'));
  console.log('\n===== BAD RESPONSES (' + bad.length + ') =====');
  console.log([...new Set(bad)].slice(0, 12).join('\n') || 'none');
  await browser.close().catch(() => {});
  process.exit(0);
})().catch((e) => { console.log('FATAL:', e.message); process.exit(1); });
