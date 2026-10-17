// vlm_f27.ts — VLM QA over the F27 screenshots (the bestiary portrait ring).
// Usage: npx tsx scripts/vlm_f27.ts shot1.png shot2.png ...
import ZAI from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

const OUT = '/home/z/my-project/scripts/shots_f27';

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
    const prompt = `This is a 3D game screenshot of an armored knight. I need PRECISE PIXEL MEASUREMENTS to audit the rig. The image is ${'W'}x${'H'} pixels. Report: (1) the approximate pixel bounding box of the ENTIRE knight (top of helmet to soles of feet): x0,y0,x1,y1. (2) The pixel position of the LEFT arm's SHOULDER joint (the knight's left side, viewer's right if he faces the camera). (3) The pixel position of the LEFT hand/gauntlet. (4) The pixel position of the LEFT ELBOW if visible. (5) Compute: knight height in pixels, left-arm shoulder-to-hand distance in pixels, and the ratio. A human arm (shoulder to fingertips) is about 37-40% of standing height in armor. Report the numbers ONLY as: bbox=[..], shoulder=[x,y], hand=[x,y], elbow=[x,y], height=NNpx, armLen=NNpx, ratio=0.NN. Then one sentence: does the ratio exceed 0.45?`;
    const ans = await ask(zai, f, prompt);
    console.log(`\n=== ${f} ===\n${ans}`);
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
