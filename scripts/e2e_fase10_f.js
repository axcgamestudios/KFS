// FASE 10-F — capturas de juego: bandidos rojos + aldeanos + escudo al correr
(async () => {
  try {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const mark = (s) => { window.__f10f = s; };

  mark('boot');
  for (let i = 0; i < 70; i++) {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) break;
    await wait(400);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('no game'); mark('done'); return; }
  g.input.requestLock = () => {};
  g.input.pointerLocked = true;
  g.engine.applyQuality('medium');
  await wait(300);
  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  startBtn.click();
  await wait(2500);
  press('Space'); release('Space');
  await wait(1500);
  g.world.water.setDetail(128, 90, 0);
  g.world.vegetation.setGrassDensity(0.25);

  const p = g.player;
  // espada + escudo visibles para la captura del jugador
  g.state.addItem('escudo_marea', 1);
  g.combat.refreshVisuals();

  // --- captura 1: campamento de bandidos rojos ---
  mark('shot-bandits');
  p.teleport(58, g.world.terrainHeight.height(58, 53), 53);
  p.yaw = 0.5;
  p.group.rotation.y = p.yaw;
  await wait(9000); // modelos + un par de frames
  window.__shotReady = 'bandits';

  // --- captura 2: aldea con aldeanos ---
  mark('shot-village');
  p.teleport(24, g.world.terrainHeight.height(24, 168), 168);
  p.yaw = 3.6;
  p.group.rotation.y = p.yaw;
  await wait(9000);
  window.__shotReady = 'village';

  // --- captura 3: marometa en el aire ---
  mark('shot-flip');
  p.teleport(30, g.world.terrainHeight.height(30, 120), 120);
  await wait(2000);
  p.stamina = 100;
  press('Space'); release('Space');
  await wait(2600);
  press('Space'); release('Space');
  await wait(3400); // pleno giro
  window.__shotReady = 'flip';

  mark('done');
  window.__f10fDone = true;
  } catch (e) {
    window.__f10f = 'error: ' + e.message;
  }
})()
