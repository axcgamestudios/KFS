// vlm_f28.ts — VLM QA over the F28 screenshots (the alchemist's table,
// the traveller's camp, the HUD strip and the two panels).
// Usage: npx tsx scripts/vlm_f28.ts shot1.png shot2.png ...
import ZAI from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

const OUT = '/home/z/my-project/scripts/shots_f28';

async function ask(zai: any, file: string, prompt: string): Promise<string> {
  const b64 = fs.readFileSync(`${OUT}/${file}`).toString('base64');
  const response = await zai.chat.completions.createVision({
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
      ],
    }],
    thinking: { type: 'disabled' },
  });
  return response.choices[0]?.message?.content || 'No response';
}

const PROMPTS: Record<string, string> = {
  'mesa.png':
    'This is a 3D game screenshot near a village garden. Somewhere near the center-left there should be an ALCHEMY TABLE: a wooden work table with a small brass boiler/pot (possibly glowing), a few glass jars on a lower shelf, a post with hanging herbs. Answer: (1) Is the alchemy table clearly visible? (2) Does it read as a crafting station (boiler + jars + table)? (3) Any floating/broken geometry, z-fighting, or objects intersecting the ground? (4) Is it placed sensibly in the village (not inside a wall or floating)? End with VERDICT: OK or ISSUES followed by one line.',
  'viajero_camp.png':
    'This is a 3D game screenshot of a wilderness camp. Expected: a small fire pit with stones and embers, a bedroll, a lashed trade crate with a tarp, a banner post with a hanging red banner, and a villager NPC (the Traveller) with a cape and a sack in one hand, standing near the fire. Answer: (1) Which of those elements are visible? (2) Does the NPC look grounded (feet on terrain, not floating or sunk)? (3) Does the camp read as a merchant camp? (4) Any broken geometry or overlapping props? End with VERDICT: OK or ISSUES followed by one line.',
  'hud_effects.png':
    'This is a 3D game screenshot with a HUD. Near the TOP CENTER there should be a strip of small effect chips: each a small icon + a short label + a seconds countdown + a tiny progress bar. Expected labels include Spanish effect names (e.g. "Fuerza del Coloso", "Piel de Piedra", "Masa Inerte", "Filo Ígneo"). Answer: (1) Is the effect strip visible at top center? (2) How many chips, and what labels can you read? (3) Do the chips overlap anything important (health bar, compass)? End with VERDICT: OK or ISSUES followed by one line.',
  'panel_alchemy.png':
    'This is a game UI screenshot of a crafting panel titled like "MESA DE ALQUIMIA" (Maren\'s distillation table). Expected: a header with a coin count, a recipe grid (potion cards with material checklists like "Gelatina Básica 2/2" and brew buttons), possibly a RUNNING strip of active effects at the top. Answer: (1) Is the panel legible and well-laid-out (no text overflow, no overlapping cards)? (2) How many recipe cards are visible? (3) Are the material have/need numbers readable? (4) Is there a RUNNING strip and what does it show? End with VERDICT: OK or ISSUES followed by one line.',
  'panel_sells.png':
    'This is a game UI screenshot of a merchant panel with a "HE BUYS" sell tab (El Viajero, the wandering merchant). Expected: a list of items he buys with prices, each card showing "in your satchel: N", and Sell buttons. Answer: (1) Is the sell tab active and legible? (2) Are there cards with items carried ("in your satchel" greater than 0) or all zero? (3) Any text overflow or broken layout? (4) Does the panel clearly communicate selling? End with VERDICT: OK or ISSUES followed by one line.',
};

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) { console.log('no files'); return; }
  const zai = await ZAI.create();
  for (const f of files) {
    const prompt = PROMPTS[f] ?? 'Describe this game screenshot in two sentences, then list any visual glitches.';
    const ans = await ask(zai, f, prompt);
    console.log(`\n=== ${f} ===\n${ans}`);
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
