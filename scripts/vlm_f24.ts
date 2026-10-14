// vlm_f24.ts — literal-description VLM QA over the F24 screenshots.
// Usage: npx tsx scripts/vlm_f24.ts shot1.png shot2.png ...
import ZAI from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

const OUT = '/home/z/my-project/scripts/shots_f24';

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
    const prompt = `Describe this video-game screenshot LITERALLY, in 4-6 short factual bullet points. Focus ONLY on: (1) where the knight's sword is pointing (up/down/forward/backward relative to the knight's body and which end is the blade vs the handle), (2) whether the sword handle is inside the knight's fist or floating away from the hand, (3) the knight's arm position, (4) any clipping of the sword through the body or ground. Do not comment on art quality, lighting, or anything else.`;
    const ans = await ask(zai, f, prompt);
    console.log(`\n=== ${f} ===\n${ans}`);
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
