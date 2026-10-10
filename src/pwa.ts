// Registers the service worker that makes the app work offline. A new version is not taken over
// by itself: reloading would lose what is not saved yet, so the app asks first.
import { registerSW } from 'virtual:pwa-register';

/** Registers the service worker. `onUpdate` is called when a new version is ready; the returned function loads it. */
export function registerOffline(onUpdate: () => void): (() => Promise<void>) | null {
  if (!('serviceWorker' in navigator)) return null;
  return registerSW({ immediate: true, onNeedRefresh: onUpdate }) as () => Promise<void>;
}
