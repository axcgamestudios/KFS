// Probe terrain heights at candidate Fase 4 POI locations.
import { TerrainHeight } from '../src/game/world/TerrainHeight';

const t = new TerrainHeight();
const spots: Array<[string, number, number]> = [
  // Sunken sanctuary: swimmable depth (2.5-5 m) off the NE coast near the bay
  ['sanctuary_a (60, 300)', 60, 300],
  ['sanctuary_b (80, 310)', 80, 310],
  ['sanctuary_c (100, 320)', 100, 320],
  ['sanctuary_d (120, 330)', 120, 330],
  ['sanctuary_e (90, 280)', 90, 280],
  ['sanctuary_f (110, 290)', 110, 290],
  // Flagship wreck: shoreline of Crow Isle (volcanic NW)
  ['flagship_a (-660, -560)', -660, -560],
  ['flagship_b (-640, -580)', -640, -580],
  ['flagship_c (-690, -520)', -690, -520],
  ['flagship_d (-700, -560)', -700, -560],
  // Cove of Silence: below the pirate fort, near sea level, flat-ish
  ['cove_a (-630, -470)', -630, -470],
  ['cove_b (-600, -450)', -600, -450],
  ['cove_c (-650, -440)', -650, -440],
  ['cove_d (-680, -460)', -680, -460],
  // Great Maple glade: north valley
  ['arce_a (-60, -260)', -60, -260],
  ['arce_b (-40, -280)', -40, -280],
  ['arce_c (-80, -230)', -80, -230],
  ['arce_d (-120, -280)', -120, -280],
  // Stable: village edge north
  ['stable_a (34, 150)', 34, 150],
  ['stable_b (40, 140)', 40, 140],
  ['stable_c (28, 138)', 28, 138],
  // Wild horse meadows
  ['meadow_north (-60, -150)', -60, -150],
  ['meadow_west (-200, -80)', -200, -80],
  // Treasure dig spot: east cove below the lighthouse isle
  ['dig_a (560, 160)', 560, 160],
  ['dig_b (600, 150)', 600, 150],
  ['dig_c (520, 180)', 520, 180],
];

for (const [name, x, z] of spots) {
  const h = t.height(x, z);
  const slope = t.slope(x, z, h);
  const forest = t.forestMask(x, z);
  console.log(
    `${name.padEnd(28)} h=${h.toFixed(2).padStart(8)} slope=${slope.toFixed(2)} forest=${forest.toFixed(2)}${h < 0 && h > -6 ? '  ← swimmable' : ''}${h > 1 && h < 6 ? '  ← shore' : ''}`,
  );
}

// Sanctuary: scan a grid for a 3-5m deep patch
console.log('\n-- swimmable patch scan NE bay (x 70..140, z 260..340) --');
let best = '';
for (let x = 70; x <= 140; x += 10) {
  for (let z = 260; z <= 340; z += 10) {
    const h = t.height(x, z);
    if (h < -2.6 && h > -5.2) {
      const slope = t.slope(x, z, h);
      if (slope < 0.3) best += ` (${x},${z},h=${h.toFixed(1)})`;
    }
  }
}
console.log('candidates:', best || 'none');

// Cove: flat-ish area 0.5-4m near Crow Isle
console.log('\n-- cove scan around Crow fort (-640±60, -470±50) --');
let cove = '';
for (let x = -700; x <= -580; x += 10) {
  for (let z = -500; z <= -420; z += 10) {
    const h = t.height(x, z);
    if (h > 0.5 && h < 5) {
      const slope = t.slope(x, z, h);
      if (slope < 0.28) cove += ` (${x},${z},h=${h.toFixed(1)},s=${slope.toFixed(2)})`;
    }
  }
}
console.log('candidates:', cove || 'none');
