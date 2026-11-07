import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const images = Array.from({ length: 9 }, (_, stage) => {
  const imagePath = path.join(root, 'preview', 'assets', 'santa-stage-' + stage + '.jpg');
  return 'data:image/jpeg;base64,' + fs.readFileSync(imagePath).toString('base64');
});
const output = '<script>\n  const SANTA_IMAGES = ' + JSON.stringify(images) + ';\n</script>\n';
fs.writeFileSync(path.join(root, 'gas', 'SantaImages.html'), output);
console.log('9段階のサンタ画像をGAS用HTMLへ埋め込みました。');
