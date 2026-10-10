import ZAI from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

async function analyze(path: string, label: string) {
  const imageBase64 = fs.readFileSync(path).toString('base64');
  const zai = await ZAI.create();
  const response = await zai.chat.completions.create({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `Analyze this image (${label}). Describe in detail: 1) What it shows (scene, objects, characters), 2) exact game title text if any (transcribe it EXACTLY as written), 3) visual style and color palette (with approximate hex codes of the main colors), 4) the STYLE of any buttons/UI elements visible (shape, borders, colors, font style, icons), 5) lighting and atmosphere. Be specific and concise. If it is a photograph/texture, say so.` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
        ]
      }
    ]
  });
  console.log(`\n========== ${label} ==========`);
  console.log(response.choices[0]?.message?.content || 'No response');
}

async function main() {
  try {
    await analyze('/home/z/my-project/upload/pasted_image_1791600680704.png', 'pasted_image_1791600680704');
    await analyze('/home/z/my-project/upload/pasted_image_1791602449581.png', 'pasted_image_1791602449581');
    await analyze('/home/z/my-project/upload/Screenshot 2026-10-09 21.20.47.png', 'Screenshot 2026-10-09');
  } catch (e) {
    console.error('Error:', (e as Error).message);
  }
}
main();
