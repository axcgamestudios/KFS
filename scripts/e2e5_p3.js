(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__kotfsGame;
  const log = window.__kotfsE2ELog || (window.__kotfsE2ELog = []);
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  // ---- 9. Villager NPCs ----
  const npcs = g.npcs || [];
  const villagers = npcs.filter((n) => n.model && n.model.constructor.name === 'VillagerModel');
  check('NPCs con cuerpo de aldeano (VillagerModel)', villagers.length >= 6, `${villagers.length}/${npcs.length}`);
  const variety = villagers.some((v) => v.model.root.children[0] && v.model.root.children[0].children.length > 3);
  check('Variedad en aldeanos (extras montados)', villagers.some((v) => { let c = 0; v.model.root.traverse((o) => { if (o.isMesh) c++; }); return c > 26; }));

  // ---- 10. Console errors ----

  window.__kotfsE2ELog = log;
  return log.slice(-8).join('\n');
})().catch((e) => { window.__kotfsE2ELog.push('ERROR '+e); return String(e); });