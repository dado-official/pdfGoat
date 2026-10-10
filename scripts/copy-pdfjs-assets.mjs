// Copies the files PDF.js loads at runtime (character maps, standard fonts, image decoders,
// colour profiles) into public/pdfjs, so they are served from our own origin instead of a CDN.
// Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'pdfjs-dist');
const to = join(root, 'public', 'pdfjs');

if (!existsSync(from)) {
  console.error('pdfjs-dist is not installed. Run "npm install" first.');
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(from, dir), join(to, dir), { recursive: true });
}
// Keep the licence next to the copied files.
cpSync(join(from, 'LICENSE'), join(to, 'LICENSE'));
console.log('Copied PDF.js assets to public/pdfjs');
