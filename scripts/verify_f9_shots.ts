import ZAI from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

/** Verify Fase 9 screenshots with the VLM: villagers scale, dragon size,
 *  water look, grass coverage. */
async function analyze(path: string, prompt: string): Promise<string> {
  const imageBase64 = fs.readFileSync(path).toString('base64');
  const zai = await ZAI.create();
  const response = await zai.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
        ],
      },
    ],
  });
  return response.choices[0]?.message?.content || 'No response';
}

async function main() {
  const base = '/home/z/my-project/download/capturas/';
  const checks: Array<[string, string]> = [
    ['f9_aldeanos_humanos.png',
      'Game screenshot review: Do the villagers/NPCs look like normal-sized humans relative to the houses and street (not giants)? Answer PASS or FAIL with one short reason.'],
    ['f9_dragon_gigante.png',
      'Game screenshot review: Is there a huge dragon (epic giant size, much bigger than a human) visible? Answer PASS or FAIL with one short reason about its size.'],
    ['f9_agua_ultra.png',
      'Game screenshot review: Does the sea look like deep blue ocean water with sky reflections (not pale/clear/white water)? Answer PASS or FAIL with one short reason.'],
    ['f9_pradera_cerca.png',
      'Game screenshot review: Is there 3D grass visible covering the ground naturally (fine blades near, denser patches far)? Answer PASS or FAIL with one short reason.'],
  ];
  for (const [file, prompt] of checks) {
    try {
      const out = await analyze(base + file, prompt);
      console.log(`\n=== ${file} ===\n${out}`);
    } catch (e) {
      console.log(`\n=== ${file} === ERROR: ${(e as Error).message}`);
    }
  }
}
main();
