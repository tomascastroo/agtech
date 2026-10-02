/**
 * Sincronización del escáner. Reanudable e idempotente:
 *  1. crea (o retoma) la sesión en el servidor con el mismo id generado en el teléfono;
 *  2. pregunta qué cuadros ya tiene y sube solo los faltantes (cada uno con su SHA-256);
 *  3. finaliza: si el servidor detecta faltantes, se vuelven a subir en la próxima vuelta;
 *  4. espera el conteo OFICIAL del servidor.
 * Si se corta la conexión en cualquier punto, la próxima vuelta continúa desde donde quedó.
 */
import { api, ApiError } from '@/lib/api/client';
import {
  deleteFrames,
  framesOf,
  getScan,
  listScans,
  updateScan,
  type LocalScan,
  type LocalScanState,
} from './store';

interface ServerScan {
  id: string;
  status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  receivedSampleIndices?: number[];
  receivedKeyIndices?: number[];
  official: { count: number | null; lowerBound: boolean; model: { simulated: boolean } } | null;
  quality: string | null;
  error: string | null;
}

const ACTIVE: LocalScanState[] = ['PENDING_SYNC', 'SYNCING', 'PROCESSING'];
let running: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Notifica a la interfaz cuando cambia el estado de algún escaneo. */
export function onScansChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const isNetworkError = (error: unknown) => !(error instanceof ApiError) || error.status >= 500;

async function setState(id: string, patch: Partial<LocalScan>) {
  await updateScan(id, patch);
  emit();
}

async function syncOne(scan: LocalScan): Promise<void> {
  const base = `/producer/me/requests/${scan.requestId}/scans`;
  if (scan.state === 'PENDING_SYNC' || scan.state === 'SYNCING') {
    await setState(scan.id, { state: 'SYNCING', error: null });
    let server = await api<ServerScan>(base, {
      method: 'POST',
      body: {
        id: scan.id,
        mode: scan.mode,
        startedAt: scan.startedAt,
        sampledFps: scan.sampledFps,
        frameWidth: scan.frameWidth,
        frameHeight: scan.frameHeight,
        line: scan.line,
        ...(scan.location
          ? {
              latitude: scan.location.latitude,
              longitude: scan.location.longitude,
              accuracyM: scan.location.accuracyM,
            }
          : {}),
        device: scan.device,
      },
    });
    if (server.status === 'UPLOADING') {
      const have = {
        SAMPLE: new Set(server.receivedSampleIndices ?? []),
        KEY: new Set(server.receivedKeyIndices ?? []),
      };
      const frames = await framesOf(scan.id);
      let uploaded = have.SAMPLE.size + have.KEY.size;
      for (const frame of frames) {
        if (have[frame.kind].has(frame.index)) continue;
        const form = new FormData();
        form.set('kind', frame.kind);
        form.set('index', String(frame.index));
        form.set('capturedMs', String(frame.capturedMs));
        form.set('sha256', frame.sha256);
        form.set('file', frame.blob, `${frame.kind.toLowerCase()}-${frame.index}.jpg`);
        await api(`${base}/${scan.id}/frames`, { method: 'POST', form });
        uploaded += 1;
        if (uploaded % 10 === 0) await setState(scan.id, { uploaded });
      }
      await setState(scan.id, { uploaded });
      try {
        server = await api<ServerScan>(`${base}/${scan.id}/finalize`, {
          method: 'POST',
          body: {
            endedAt: scan.endedAt ?? new Date().toISOString(),
            durationS: scan.durationS,
            expectedFrames: scan.frameCount,
            expectedKeyFrames: scan.keyFrameCount,
            clientResult: scan.deviceResult ?? { preliminary: true },
            ...(scan.heading
              ? {
                  headingStartDeg: scan.heading.startDeg ?? undefined,
                  sweptDeg: scan.heading.sweptDeg ?? undefined,
                  headingSource: scan.heading.source,
                }
              : {}),
            ...(scan.locationEnd
              ? { endLatitude: scan.locationEnd.latitude, endLongitude: scan.locationEnd.longitude }
              : {}),
            ...(scan.maxDisplacementM !== null ? { maxDisplacementM: scan.maxDisplacementM } : {}),
            warnings: scan.warnings,
          },
        });
      } catch (error) {
        // 409 = faltan cuadros (p. ej. se cortó la subida): la próxima vuelta los reenvía.
        if (error instanceof ApiError && error.status === 409) {
          await setState(scan.id, { state: 'PENDING_SYNC' });
          return;
        }
        throw error;
      }
    }
    // El servidor ya tiene todos los cuadros: se liberan del teléfono.
    await deleteFrames(scan.id);
    await setState(scan.id, { state: server.status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING' });
    if (server.status === 'COMPLETED' || server.status === 'FAILED')
      await applyServer(scan.id, server);
    return;
  }
  if (scan.state === 'PROCESSING') {
    const server = await api<ServerScan>(`${base}/${scan.id}`);
    await applyServer(scan.id, server);
  }
}

async function applyServer(id: string, server: ServerScan) {
  if (server.status === 'COMPLETED') {
    await setState(id, {
      state: 'COMPLETED',
      official: {
        count: server.official?.count ?? null,
        quality: server.quality,
        lowerBound: server.official?.lowerBound ?? false,
        simulated: server.official?.model.simulated ?? false,
      },
    });
  } else if (server.status === 'FAILED') {
    await setState(id, { state: 'FAILED', error: server.error });
  }
}

/** Una vuelta de sincronización de todos los escaneos pendientes (una a la vez). */
export function syncPendingScans(): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (isOffline()) return;
    const pending = (await listScans()).filter((s) => ACTIVE.includes(s.state));
    for (const scan of pending) {
      const fresh = await getScan(scan.id);
      if (!fresh) continue;
      try {
        await syncOne(fresh);
      } catch (error) {
        if (isNetworkError(error)) {
          // Sin señal o servidor caído: queda pendiente para la próxima vuelta.
          await setState(scan.id, {
            state: fresh.state === 'PROCESSING' ? 'PROCESSING' : 'PENDING_SYNC',
          });
          break;
        }
        await setState(scan.id, {
          state: fresh.state === 'PROCESSING' ? 'PROCESSING' : 'PENDING_SYNC',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Sincroniza al volver la señal, al volver a la pestaña y cada 20 s mientras hay pendientes. */
export function startAutoSync(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const trigger = () => void syncPendingScans();
  window.addEventListener('online', trigger);
  document.addEventListener('visibilitychange', trigger);
  const timer = window.setInterval(trigger, 20_000);
  trigger();
  return () => {
    window.removeEventListener('online', trigger);
    document.removeEventListener('visibilitychange', trigger);
    window.clearInterval(timer);
  };
}
