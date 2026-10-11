import { useEffect, useState } from 'react';

/** A temporary address for PNG bytes, freed when they change or the component goes away. Created in the effect, so StrictMode's extra cleanup cannot free an address that is still shown. */
export function usePngUrl(bytes: Uint8Array | null | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!bytes) return;
    const made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
    // oxlint-disable-next-line react/set-state-in-effect -- the address is an external resource that only exists after the effect ran
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [bytes]);
  return bytes ? url : undefined;
}
