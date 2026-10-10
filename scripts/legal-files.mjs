// Puts the licence texts into public/, so the site serves them: the licence of PDFgoat itself and
// the licences (with copyright notices) of the parts that are part of the site. Run before `dev`
// and `build`.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

// What is in the site: the dependencies, and the files of the text recognition that are copied in.
const names = [...Object.keys(pkg.dependencies), 'tesseract.js-core', '@tesseract.js-data/deu', '@tesseract.js-data/eng'];

const packageDir = (name) => join(root, 'node_modules', name);

async function licenseText(dir, meta) {
  const files = (await readdir(dir)).filter((f) => /^(licen[cs]e|copying|notice)/i.test(f));
  const texts = await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')));
  return texts.length ? texts.join('\n\n') : `(No licence file in the package. Declared licence: ${meta.license}.)`;
}

const parts = [];
for (const name of [...new Set(names)].sort()) {
  const dir = packageDir(name);
  const meta = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  // The language data packages are only wrappers (MIT) around data from tessdata_best (Apache-2.0).
  const note = name.startsWith('@tesseract.js-data/')
    ? '\nThe trained data files in this package come from https://github.com/tesseract-ocr/tessdata_best\nand are licensed under the Apache License 2.0 (the text is given under tesseract.js-core).\n'
    : name === 'workbox-window'
      ? '\nThe service worker of the site (sw.js) is made with Workbox and licensed under the same terms (MIT).\n'
      : '';
  parts.push(`${'='.repeat(78)}\n${name} ${meta.version}  (${meta.license})\n${meta.homepage ?? meta.repository?.url ?? ''}\n${'='.repeat(78)}\n${note}\n${(await licenseText(dir, meta)).trim()}\n`);
}

await mkdir(join(root, 'public'), { recursive: true });
await writeFile(join(root, 'public', 'LICENSE.txt'), await readFile(join(root, 'LICENSE'), 'utf8'));
await writeFile(join(root, 'public', 'third-party-licenses.txt'), `Licences of the parts of PDFgoat that come from others\n\n${parts.join('\n')}`);
