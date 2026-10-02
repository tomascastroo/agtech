import type { LocalScan } from './store';

export type ScanStatusTone = 'offline' | 'syncing' | 'processing' | 'done' | 'error' | 'recording';

/**
 * Estado visible de un escaneo: OFFLINE (guardado en el teléfono, sin señal) → SINCRONIZANDO →
 * PROCESANDO EN SERVIDOR → VERIFICADO EN SERVIDOR (conteo oficial) / ERROR.
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
      return { label: 'ESCANEANDO', tone: 'recording', detail: 'Escaneo en curso' };
    case 'PENDING_SYNC':
      return online
        ? { label: 'PENDIENTE', tone: 'syncing', detail: 'Se sincroniza automáticamente' }
        : {
            label: 'OFFLINE',
            tone: 'offline',
            detail: 'Guardado en el teléfono; se sube al volver la señal',
          };
    case 'SYNCING':
      return {
        label: 'SINCRONIZANDO',
        tone: 'syncing',
        detail: `Subiendo cuadros ${Math.min(scan.uploaded, total)}/${total}`,
      };
    case 'PROCESSING':
      return {
        label: 'PROCESANDO',
        tone: 'processing',
        detail: 'El servidor calcula el conteo oficial',
      };
    case 'COMPLETED':
      return {
        label: 'VERIFICADO EN SERVIDOR',
        tone: 'done',
        detail: scan.official?.chute
          ? `Bovinos identificados (oficial): ${scan.official.count ?? 0}${scan.official.chute.ambiguous + scan.official.chute.insufficient ? ` · sin asociar: ${scan.official.chute.ambiguous + scan.official.chute.insufficient}` : ''}${scan.official.simulated ? ' · SIMULADO' : ''}`
          : scan.official?.count !== null && scan.official?.count !== undefined
            ? `Conteo oficial: ${scan.official.count}${scan.official.lowerBound ? ' (cota inferior)' : ''}${scan.official.simulated ? ' · SIMULADO' : ''}`
            : 'Conteo oficial disponible',
      };
    case 'FAILED':
      return {
        label: 'ERROR',
        tone: 'error',
        detail: scan.error ?? 'Falló el procesamiento oficial',
      };
  }
}
