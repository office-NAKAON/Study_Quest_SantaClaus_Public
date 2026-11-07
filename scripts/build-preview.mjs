import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const gas = path.join(root, 'gas');
const preview = path.join(root, 'preview');
let html = fs.readFileSync(path.join(gas, 'Index.html'), 'utf8');
const styles = fs.readFileSync(path.join(gas, 'Styles.html'), 'utf8');
const client = fs.readFileSync(path.join(gas, 'JavaScript.html'), 'utf8');
const images = '<script>const SANTA_IMAGES=[' + Array.from({ length: 9 }, (_, stage) => '"assets/santa-stage-' + stage + '.jpg"').join(',') + '];</script>';
const mock = '<script>' + fs.readFileSync(path.join(preview, 'mock-backend.js'), 'utf8') + '</script>';
html = html.replace("<?!= include('Styles'); ?>", styles)
  .replace("<?!= include('SantaImages'); ?>", images + mock)
  .replace("<?!= include('JavaScript'); ?>", client);
fs.writeFileSync(path.join(preview, 'index.html'), html);
console.log('試運転版を preview/index.html に生成しました。');
