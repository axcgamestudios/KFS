// Converts the raw 2048x2048 RGBA terrain buffer into PNG via sharp.
const fs = require('fs');
const sharp = require('sharp');

const SRC = '/home/z/my-project/scripts/map_base.rgba';
const DST = '/home/z/my-project/scripts/map_base.png';
const SIZE = 2048;

const buf = fs.readFileSync(SRC);
if (buf.length !== SIZE * SIZE * 4) {
  console.error('Unexpected buffer size:', buf.length, 'expected', SIZE * SIZE * 4);
  process.exit(1);
}
sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(DST)
  .then((info) => console.log('map_base.png OK', JSON.stringify(info)))
  .catch((e) => { console.error(e); process.exit(1); });
