// vlm_f28_arms.ts — literal-description VLM QA over the F28 arm-band renders.
// Usage: npx tsx scripts/vlm_f28_arms.ts shot1.png shot2.png ...
import ZAI from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

const OUT = '/home/z/my-project/scripts/shots_f28_arms';

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

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) { console.log('no files'); return; }
  const zai = await ZAI.create();
  for (const f of files) {
    const prompt = `This is a grayscale 3D render of an armored knight in a test pose. Describe it LITERALLY in 4-6 short factual bullets. Focus ONLY on: (1) the knight's ARMS — are they solid plate armor tubes (rerebrace-forearm-gauntlet), or do they look stretched, smeared, rubbery, pinched, torn or broken anywhere? (2) the elbow region — clean hinge overlap or visible mesh tearing? (3) the hands/fists — closed gauntlets, intact, or deformed/missing? (4) the shoulder/armpit — does the arm connect cleanly to the torso? (5) any body part floating away, spiking, or collapsing to a point. Do not comment on art quality or lighting.`;
    const ans = await ask(zai, f, prompt);
    console.log(`\n=== ${f} ===\n${ans}`);
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
