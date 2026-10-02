/** Datos mínimos de la solicitud para abrir el escáner sin señal (se guardan al verla en línea). */
export interface CachedRequest {
  id: string;
  assetName: string;
}

const key = (id: string) => `agro-scanner-request:${id}`;

export function cacheRequest(request: CachedRequest): void {
  try {
    localStorage.setItem(key(request.id), JSON.stringify(request));
  } catch {
    // Almacenamiento no disponible (modo privado): el escáner pedirá los datos en línea.
  }
}

export function cachedRequest(id: string): CachedRequest | null {
  try {
    const raw = localStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as CachedRequest) : null;
  } catch {
    return null;
  }
}
