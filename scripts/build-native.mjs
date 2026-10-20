import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const out = new URL('../dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const files = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  '.nojekyll'
];
const dirs = ['assets', 'data', 'images'];

for (const file of files) {
  const src = new URL('../' + file, import.meta.url);
  if (existsSync(src)) await cp(src, new URL(file, out));
}
for (const dir of dirs) {
  const src = new URL('../' + dir + '/', import.meta.url);
  if (existsSync(src)) await cp(src, new URL(dir + '/', out), { recursive: true });
}

console.log('Fuelr web assets copied to dist/ for Capacitor.');
