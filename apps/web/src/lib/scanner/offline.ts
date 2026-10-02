/** Registro del service worker y precarga de lo necesario para escanear sin señal. */
import { ortBundle, SCANNER_MODEL } from './detector';

/** Motor (el que corresponde a este dispositivo) y modelo. */
export function scannerAssets(): string[] {
  const ort = ortBundle();
  return [ort.module, ...ort.files, SCANNER_MODEL.url];
}

export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') return;
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

/** Descarga (una vez) el motor y el modelo para que queden en caché del teléfono. */
export async function warmScannerAssets(): Promise<boolean> {
  try {
    // De a uno: bajar los ~30 MB en paralelo es un pico de memoria innecesario en el celular.
    for (const url of scannerAssets()) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(url);
      await response.arrayBuffer();
    }
    return true;
  } catch {
    return false;
  }
}

/** Mismos nombres que public/sw.js. */
const STATIC_CACHE = 'agro-static-v1';
const PAGES_CACHE = 'agro-pages-v1';

/**
 * Guarda la página actual del escáner y los archivos de Next que usó, para poder abrirla sin
 * señal. Hace falta porque al escáner se llega con navegación interna (no queda el HTML en
 * caché) y los archivos de la primera visita se cargan antes de que el service worker controle
 * la página.
 */
export async function cacheScannerPageForOffline(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const pages = await caches.open(PAGES_CACHE);
    await pages.add(new Request(location.pathname, { credentials: 'same-origin' }));
    const statics = await caches.open(STATIC_CACHE);
    const urls = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => new URL(url).pathname.startsWith('/_next/static/'));
    await Promise.all(urls.map(async (url) => (await statics.match(url)) ?? statics.add(url)));
  } catch {
    // Sin Cache API o sin espacio: el escáner funciona igual con señal.
  }
}
