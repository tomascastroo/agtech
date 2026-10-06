import type { LocalScan } from './store';

export type ScanStatusTone = 'offline' | 'syncing' | 'processing' | 'done' | 'error' | 'recording';

/**
 * Estado visible de un escaneo: Sin señal (guardado en el teléfono) → Sincronizando →
 * Procesando → Verificado en servidor (conteo oficial) / Error.
 */
export function scanStatus(
  scan: Pick<
    LocalScan,
    'state' | 'uploaded' | 'frameCount' | 'keyFrameCount' | 'official' | 'error'
  >,
  online: boolean,
): { label: string; tone: ScanStatusTone; detail: string } {
  const total = scan.frameCount + scan.keyFrameCount;
  switch (scan.state) {
    case 'RECORDING':
      return { label: 'Escaneando', tone: 'recording', detail: 'Escaneo en curso' };
    case 'PENDING_SYNC':
      return online
        ? { label: 'Pendiente', tone: 'syncing', detail: 'Se sincroniza automáticamente' }
        : {
            label: 'Sin señal',
            tone: 'offline',
            detail: 'Guardado en el teléfono; se sube al volver la señal',
          };
    case 'SYNCING':
      return {
        label: 'Sincronizando',
        tone: 'syncing',
        detail: `Subiendo cuadros ${Math.min(scan.uploaded, total)}/${total}`,
      };
    case 'PROCESSING':
      return {
        label: 'Procesando',
        tone: 'processing',
        detail: 'El servidor calcula el conteo oficial',
      };
    case 'COMPLETED':
      return {
        label: 'Verificado en servidor',
        tone: 'done',
        detail: scan.official?.chute
          ? `Bovinos identificados (oficial): ${scan.official.count ?? 0}${scan.official.chute.ambiguous + scan.official.chute.insufficient ? ` · sin asociar: ${scan.official.chute.ambiguous + scan.official.chute.insufficient}` : ''}${scan.official.simulated ? ' · SIMULADO' : ''}`
          : scan.official?.count !== null && scan.official?.count !== undefined
            ? `Conteo oficial: ${scan.official.count}${scan.official.lowerBound ? ' (cota inferior)' : ''}${scan.official.simulated ? ' · SIMULADO' : ''}`
            : 'Conteo oficial disponible',
      };
    case 'FAILED':
      return {
        label: 'Error',
        tone: 'error',
        detail: scan.error ?? 'Falló el procesamiento oficial',
      };
  }
}
