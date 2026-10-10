// Loads MuPDF. Its notes about repaired files go to the debug log instead of the error log,
// because a file that opens fine is not an error.
export type Mupdf = typeof import('mupdf');

export function loadMupdf(): Promise<Mupdf> {
  const global = globalThis as { $libmupdf_wasm_Module?: object };
  global.$libmupdf_wasm_Module ??= { print: console.debug, printErr: console.debug };
  return import('mupdf');
}
