// Copies what text recognition needs into public/ocr, so it is served from the site itself:
// the worker, the engine (three builds for different processors) and the language data for
// German and English. Nothing is loaded from elsewhere, and nothing is fetched until the user
// starts a text recognition. Run before `dev` and `build`.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
const pkg = (name) => dirname(require.resolve(`${name}/package.json`));

const files = [
  [join(pkg('tesseract.js'), 'dist', 'worker.min.js'), 'worker.min.js'],
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'].map((f) => [join(pkg('tesseract.js-core'), f), f]),
  ...['deu', 'eng'].map((l) => [join(pkg(`@tesseract.js-data/${l}`), '4.0.0_best_int', `${l}.traineddata.gz`), join('lang', `${l}.traineddata.gz`)]),
];

await mkdir(join(out, 'lang'), { recursive: true });
for (const [from, to] of files) {
  const target = join(out, to);
  const same = await stat(target).then((t) => stat(from).then((f) => t.size === f.size && t.mtimeMs >= f.mtimeMs)).catch(() => false);
  if (!same) await copyFile(from, target);
}
