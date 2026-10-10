// Everything that is part of the site and under a licence of its own. Every package that ends up
// in the build must be listed here; a test checks this against package.json.

export interface Component {
  /** Name of the npm package, or of the thing. */
  name: string;
  what: { de: string; en: string };
  license: string;
  url: string;
}

export const COMPONENTS: Component[] = [
  { name: 'mupdf', what: { de: 'Die PDF-Engine (als WebAssembly): zeigt Seiten an und schreibt PDFs', en: 'The PDF engine (as WebAssembly): shows pages and writes PDFs' }, license: 'AGPL-3.0-or-later', url: 'https://mupdf.com/' },
  { name: 'react', what: { de: 'Oberfläche', en: 'User interface' }, license: 'MIT', url: 'https://react.dev/' },
  { name: 'react-dom', what: { de: 'Oberfläche im Browser', en: 'User interface in the browser' }, license: 'MIT', url: 'https://react.dev/' },
  { name: 'fflate', what: { de: 'ZIP-Dateien und Komprimierung', en: 'ZIP files and compression' }, license: 'MIT', url: 'https://github.com/101arrowz/fflate' },
  { name: 'tesseract.js', what: { de: 'Texterkennung im Browser', en: 'Text recognition in the browser' }, license: 'Apache-2.0', url: 'https://github.com/naptha/tesseract.js' },
  { name: 'tesseract.js-core', what: { de: 'Die Engine der Texterkennung (Tesseract als WebAssembly)', en: 'The engine of the text recognition (Tesseract as WebAssembly)' }, license: 'Apache-2.0', url: 'https://github.com/naptha/tesseract.js-core' },
  { name: '@tesseract.js-data/deu', what: { de: 'Sprachdaten Deutsch für die Texterkennung', en: 'German language data for the text recognition' }, license: 'Apache-2.0', url: 'https://github.com/tesseract-ocr/tessdata_best' },
  { name: '@tesseract.js-data/eng', what: { de: 'Sprachdaten Englisch für die Texterkennung', en: 'English language data for the text recognition' }, license: 'Apache-2.0', url: 'https://github.com/tesseract-ocr/tessdata_best' },
  { name: '@fontsource-variable/geist', what: { de: 'Die Schrift der Oberfläche (Geist)', en: 'The typeface of the interface (Geist)' }, license: 'OFL-1.1', url: 'https://vercel.com/font' },
  { name: 'workbox-window', what: { de: 'Offline-Betrieb: Anmeldung des Service Workers', en: 'Offline use: registering the service worker' }, license: 'MIT', url: 'https://developer.chrome.com/docs/workbox' },
  { name: 'workbox', what: { de: 'Offline-Betrieb: der Service Worker (Zwischenspeicher)', en: 'Offline use: the service worker (cache)' }, license: 'MIT', url: 'https://developer.chrome.com/docs/workbox' },
];

/** Packages of package.json "dependencies" that are covered by an entry (workbox-window is listed with its sibling). */
export const COVERED = new Set(COMPONENTS.map((c) => c.name));
