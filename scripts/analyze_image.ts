import ZAI from 'z-ai-web-dev-sdk';
import * as fs from 'fs';

async function main() {
  try {
    const imageBase64 = fs.readFileSync('/home/z/my-project/upload/pasted_image_1791600680704.png').toString('base64');
    const zai = await ZAI.create();
    const response = await zai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image in detail for a game art direction reference: what does it show (scene, objects, characters), the visual style, color palette, lighting, atmosphere, and medieval elements. Be specific and concise.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
          ]
        }
      ]
    });
    console.log(response.choices[0]?.message?.content || 'No response');
  } catch (e) {
    console.error('Error analyzing image:', (e as Error).message);
  }
}
main();
