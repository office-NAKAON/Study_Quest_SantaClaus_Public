import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const gasDir = path.join(root, 'gas');
const gasFiles = fs.readdirSync(gasDir).filter((file) => file.endsWith('.gs'));

const serverSource = gasFiles.map((file) => {
  const source = fs.readFileSync(path.join(gasDir, file), 'utf8');
  new vm.Script(source, { filename: file });
  return source;
}).join('\n');

const clientHtml = fs.readFileSync(path.join(gasDir, 'JavaScript.html'), 'utf8');
const clientSource = clientHtml.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
new vm.Script(clientSource, { filename: 'JavaScript.html' });

JSON.parse(fs.readFileSync(path.join(gasDir, 'appsscript.json'), 'utf8'));

const definedFunctions = new Set(
  [...serverSource.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)].map((match) => match[1])
);
const serverCalls = new Set(
  [...clientSource.matchAll(/callServer\(\s*['"]([A-Za-z0-9_]+)['"]/g)].map((match) => match[1])
);
const missingFunctions = [...serverCalls].filter((name) => !definedFunctions.has(name));

if (missingFunctions.length) {
  throw new Error(`クライアントから呼び出す関数が見つかりません: ${missingFunctions.join(', ')}`);
}

console.log(`確認完了: GAS ${gasFiles.length}ファイル、サーバー呼び出し ${serverCalls.size}件`);
