/** Registro del service worker y precarga de lo necesario para escanear sin señal. */
export const SCANNER_ASSETS = [
  '/ort/ort.webgpu.min.mjs',
  '/ort/ort-wasm-simd-threaded.asyncify.mjs',
  '/ort/ort-wasm-simd-threaded.asyncify.wasm',
  '/models/yolox_nano.onnx',
];

export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') return;
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

/** Descarga (una vez) el motor y el modelo para que queden en caché del teléfono. */
export async function warmScannerAssets(): Promise<boolean> {
  try {
    await Promise.all(
      SCANNER_ASSETS.map((u) =>
        fetch(u).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(u)))),
      ),
    );
    return true;
  } catch {
    return false;
  }
}
